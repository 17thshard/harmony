import { Awaited, Client, CommandInteraction, TextChannel } from 'discord.js';
import logger from './logging';

type CommandHandler = (client: Client, interaction: CommandInteraction) => Awaited<void>

export abstract class Command {
  constructor (public readonly name: string) {
  }

  public abstract handle (client: Client, interaction: CommandInteraction): Awaited<void>
}

export class SimpleCommand extends Command {
  constructor (name: string, public handle: CommandHandler) {
    super(name);
  }
}

export class ComplexCommand extends Command {
  constructor (name: string, private readonly subCommands: { [name: string]: CommandHandler }) {
    super(name);
  }

  public async handle (client: Client, interaction: CommandInteraction): Promise<void> {
    const subCommand = interaction.options.getSubcommand(false);

    if (subCommand === null) {
      await interaction.reply({ content: 'Sorry, this command expects a sub-command!', ephemeral: true });
      return;
    }

    const subHandler = this.subCommands[subCommand];
    if (subHandler === undefined) {
      const channel = await client.channels.fetch(interaction.channelId) as TextChannel;
      logger.error({
        message: `Could not find handler for sub-command '${interaction.commandName} ${subCommand}'`,
        context: {
          user: interaction.user.tag,
          channel: `#${channel.name}`,
          guild: interaction.guildId
        }
      });

      await interaction.reply({ content: `Sorry, the sub-command '${subCommand}' cannot be handled!`, ephemeral: true });
      return;
    }

    await subHandler(client, interaction);
  }
}