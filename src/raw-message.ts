import { Client, CommandInteraction, BaseGuildTextChannel } from 'discord.js';
import { SimpleCommand } from './commands.js';

export default {
	command: new SimpleCommand(
		'raw',
		async (client: Client, interaction: CommandInteraction) => {
			await interaction.deferReply({ ephemeral: true });
			const link = interaction.options.getString('message', true);
			const match = link.match(/(?:discord\.com|discord:\/\/-)\/channels\/(?<guildId>\d{18})\/(?<channelId>\d{18})\/(?<messageId>\d{18})/);
			if (!match) {
				await interaction.editReply('Please provide a valid message link!');
				return;
			}
			
			const { guildId, channelId, messageId } = match.groups;
			const channel = await (await client.guilds.fetch(guildId)).channels.fetch(channelId);
			if (!(channel instanceof BaseGuildTextChannel)) {
				await interaction.editReply('Please link to a message in a text channel!');
				return;
			}
			
			const message = await channel.messages.fetch(messageId);
			await interaction.editReply({
				embeds: [{
					description: message.content
						// Discord doesn't allow escaping backticks inside a code block, so if
						// we want accurate source, we can't use code blocks, have to escape it
						// all instead
						.replaceAll('\\', '\\\\')
						.replaceAll('*', '\\*')
						.replaceAll('_', '\\_')
						.replaceAll('`', '\\`')
						.replaceAll('|', '\\|')
						.replaceAll('~', '\\~')
						.replaceAll('>', '\\>')
						.replaceAll('<', '\\<')
				}]
			});
		}
	),
};