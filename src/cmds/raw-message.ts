import { ChatInputCommandInteraction, Client, BaseGuildTextChannel } from 'discord.js';
import { SimpleCommand } from '../commands';
import { escape } from '../utils/message-utils';

export default {
  command: new SimpleCommand(
    'raw',
    async (client: Client, interaction: ChatInputCommandInteraction<'cached'>) => {
      await interaction.deferReply({ ephemeral: true });
      const link = interaction.options.getString('message', true);
      const match = link.match(/(?:discord\.com|discord:\/\/-)\/channels\/(?<guildId>\d{18})\/(?<channelId>\d{18})\/(?<messageId>\d{18})/);
      if (!match) {
        await interaction.editReply('Please provide a valid message link!');
        return;
      }

      const { guildId, channelId, messageId } = match.groups;
      const channel = await (await client.guilds.fetch(guildId)).channels.fetch(channelId);
      if (!(
        channel instanceof BaseGuildTextChannel
				&& channel
				  .permissionsFor(interaction.member.user.id)
				  .has('ViewChannel')
      )) {
        await interaction.editReply('Please provide a valid message link!');
        return;
      }

      const message = await channel.messages.fetch(messageId);
      await interaction.editReply({
        embeds: [{
          description: escape(message.content)
        }]
      });
    }
  ),
};
