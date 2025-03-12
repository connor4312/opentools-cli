import {Command, Flags} from '@oclif/core'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { servers } from '../data/servers/index.js'

export default class List extends Command {
  static aliases = ['ls']

  static override description = 'List installed servers across all clients'

  static override examples = [
    '<%= config.bin %> list',
    '<%= config.bin %> list --client=claude',
    '<%= config.bin %> list --client=continue',
  ]

  static override flags = {
    client: Flags.string({
      char: 'c',
      description: 'Only show servers for this client',
      options: ['claude', 'continue'],
      required: false,
    }),
  }

  private clientDisplayNames: Record<string, string> = {
    'claude': 'Claude Desktop',
    'continue': 'Continue'
  }

  public async run(): Promise<void> {
    const {flags} = await this.parse(List)

    let foundServers = false
    const trackServers = (found: boolean) => {
      foundServers = foundServers || found
    }

    if (flags.client === 'claude') {
      trackServers(await this.listClaudeServers())
    } else if (flags.client === 'continue') {
      trackServers(await this.listContinueServers())
    } else {
      // If no client specified, show all
      trackServers(await this.listClaudeServers().catch(() => false)) // Ignore errors
      trackServers(await this.listContinueServers().catch(() => false)) // Ignore errors
    }

    if (!foundServers) {
      if (flags.client) {
        const clientName = this.clientDisplayNames[flags.client]
        this.log(`No MCP servers currently installed on ${clientName}.`)
      } else {
        this.log('No MCP servers currently installed.')
      }
    }

    this.log('') // Add final newline
  }

  private async listClaudeServers(): Promise<boolean> {
    const configPath = path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json'
    )

    try {
      const configContent = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configContent)
      const installedServers = Object.keys(config.mcpServers || {})

      if (installedServers.length > 0) {
        this.log(`\n${this.clientDisplayNames.claude}`)

        // Sort servers into registered and unknown
        const registeredServers = installedServers.filter(id => servers.some(s => s.id === id))
        const unknownServers = installedServers.filter(id => !servers.some(s => s.id === id))

        // Display registered servers first
        for (const [index, serverId] of registeredServers.entries()) {
          const prefix = index === registeredServers.length - 1 && unknownServers.length === 0 ? '└── ' : '├── '
          const link = `\u001B]8;;https://opentools.com/registry/${serverId}\u0007${serverId}\u001B]8;;\u0007`
          this.log(`${prefix}${link}`)
        }

        // Then display unknown servers
        for (const [index, serverId] of unknownServers.entries()) {
          const prefix = index === unknownServers.length - 1 ? '└── ' : '├── '
          this.log(`\u001B[31m${prefix}${serverId} (unknown)\u001B[0m`)
        }

        return true
      }

      return false

    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return false
      }
 
        throw error
      
    }
  }

  private async listContinueServers(): Promise<boolean> {
    const configPath = path.join(
      os.homedir(),
      '.continue',
      'config.json'
    )

    try {
      const configContent = await fs.readFile(configPath, 'utf8')
      const config = JSON.parse(configContent)

      // Get installed servers from the experimental.modelContextProtocolServers array
      const installedServers = config.experimental?.modelContextProtocolServers || []

      // Map installed servers back to their IDs by matching command and args
      const validServers = servers
        .filter(registryServer =>
          installedServers.some((installed: { transport: { args: string[], command: string } }) =>
            installed.transport.command === registryServer.config.command &&
            JSON.stringify(installed.transport.args.slice(0, registryServer.config.args.length)) === JSON.stringify(registryServer.config.args)
          )
        )
        .map(s => s.id)

      // Only output if there are valid servers
      if (validServers.length > 0) {
        this.log(`\n${this.clientDisplayNames.continue}`)
        // Print servers in a tree-like format
        for (const [index, serverId] of validServers.entries()) {
          const prefix = index === validServers.length - 1 ? '└── ' : '├── '
          const link = `\u001B]8;;https://opentools.com/registry/${serverId}\u0007${serverId}\u001B]8;;\u0007`
          this.log(`${prefix}${link}`)
        }

        return true
      }

      return false

    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Don't output anything if client not installed
        return false
      }
 
        throw error
      
    }
  }
}
