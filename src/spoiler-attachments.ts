import {
  Client,
  Collection,
  ColorResolvable,
  CommandInteraction,
  Interaction,
  Message,
  MessageActionRow,
  MessageButton,
  MessageComponentInteraction,
  MessageEditOptions,
  MessageEmbed,
  TextChannel
} from 'discord.js';
import { SimpleCommand } from './commands';
import logger from './logger';

const TIMEOUT = 60000;
const busy: { [userId: string]: boolean } = {};

function buildEmbed (message: string, color?: ColorResolvable): MessageEmbed {
  const embed = new MessageEmbed()
    .setTitle('Spoiler Attachments')
    .setDescription(message);

  if (color !== undefined) {
    embed.setColor(color);
  }

  return embed;
}

interface MessageResult {
  type: 'message';
  message: Message;
}

interface CancelResult {
  type: 'cancel';
  interaction: MessageComponentInteraction;
}

export default {
  command: new SimpleCommand(
    'spoiler-attachments',
    async (client: Client, interaction: CommandInteraction) => {
      if (busy[interaction.user.id] === true) {
        await interaction.reply({
          embeds: [buildEmbed('I\'m already waiting for an attachment from you!', 'RED')],
          ephemeral: true
        });
        return;
      }

      busy[interaction.user.id] = true;

      const channel = await client.channels.fetch(interaction.channelId) as TextChannel;
      const caption = interaction.options.getString('caption', false);

      logger.info({
        message: `${interaction.user.tag} initiated attachment process`,
        context: {
          channel: `#${channel.name}`,
          guild: interaction.guildId
        }
      });

      const cancelButton = new MessageButton()
        .setStyle('DANGER')
        .setLabel('Cancel')
        .setCustomId('cancel');

      await interaction.reply({
        embeds: [buildEmbed('I\'ll be sending you a direct message to which you can reply with your desired attachments!')],
        ephemeral: true
      });

      let promptMessage: Message;
      try {
        promptMessage = await interaction.user.send({
          embeds: [buildEmbed('Please send me your attachments within the next minute...')],
          components: [
            new MessageActionRow().addComponents([
              new MessageButton()
                .setStyle('LINK')
                .setLabel('Go back to channel')
                .setURL(`https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/`),
              cancelButton
            ])
          ]
        });
      } catch (error) {
        logger.error({
          message: `Could not DM user ${interaction.user.tag} for spoiler attachments`,
          error
        });

        await interaction.editReply({
          embeds: [buildEmbed('Unfortunately I can\'t send you a DM, check your privacy settings for this server!', 'RED')]
        });

        delete busy[interaction.user.id];
        return;
      }

      await interaction.editReply({
        components: [
          new MessageActionRow().addComponents([
            new MessageButton()
              .setStyle('LINK')
              .setLabel('Go to DM')
              .setURL(promptMessage.url),
            cancelButton
          ])
        ]
      });

      const messagePromise: Promise<MessageResult> = promptMessage.channel.awaitMessages({
        filter: response => response.attachments.size > 0,
        max: 1,
        time: TIMEOUT,
        errors: ['time']
      }).then(m => ({ type: 'message', message: m.first() }));
      const cancelPromise: Promise<CancelResult> = Promise.any([channel, promptMessage].map(source => source.awaitMessageComponent({
        filter: i => {
          i.deferUpdate();

          return i.user.id === interaction.user.id && i.customId === 'cancel';
        },
        componentType: 'BUTTON',
        time: TIMEOUT
      }).then(i => ({ type: 'cancel', interaction: i }))));

      try {
        const result = await Promise.any<MessageResult | CancelResult>([messagePromise, cancelPromise]);

        await promptMessage.edit({ components: [] });

        if (result.type === 'cancel') {
          const edit: MessageEditOptions = {
            embeds: [buildEmbed('The attachment process has been canceled.')],
            components: []
          };

          await Promise.all([promptMessage.edit(edit), interaction.editReply(edit)]);

          logger.info({
            message: `${interaction.user.tag} canceled attachment process`,
            context: {
              channel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });
        } else if (result.type === 'message') {
          const acknowledgment = await result.message.reply({
            embeds: [buildEmbed(`Thanks, I'll be posting your attachments to ${channel} behind spoilers!`)]
          });

          const spoilerMessage = await channel.send({
            content: caption !== null ? `${caption} (sent by ${interaction.user})` : `Spoilers from ${interaction.user}`,
            allowedMentions: {
              parse: [],
              users: [interaction.user.id]
            },
            files: result.message.attachments.map(attachment => ({
              attachment: attachment.url,
              name: `SPOILER_${attachment.name}`
            }))
          });

          await interaction.editReply({
            embeds: [buildEmbed('The attachments have been sent successfully.')],
            components: []
          });

          await acknowledgment.edit({
            embeds: [buildEmbed(`Attachments have been sent behind spoilers to ${channel}.\nUse the buttons below to manage my message.`)],
            components: [
              new MessageActionRow()
                .addComponents([
                  new MessageButton()
                    .setStyle('LINK')
                    .setLabel('Go to Message')
                    .setURL(spoilerMessage.url),
                  new MessageButton()
                    .setStyle('DANGER')
                    .setLabel('Delete Message')
                    .setCustomId(`delete-spoilers.${interaction.channelId}.${spoilerMessage.id}`)
                ])
            ]
          });

          logger.info({
            message: `Served ${result.message.attachments.size} spoilered attachment(s) for ${interaction.user.tag}`,
            context: {
              channel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });
        }
      } catch (error) {
        let message = 'Failed to process your attachments.';
        if (error instanceof AggregateError && error.errors[0] instanceof Collection && error.errors[0].size === 0) {
          message = 'No attachments have been received within a minute, aborting.';

          logger.info({
            message: `${interaction.user.tag} ran into attachment timeout`,
            context: {
              channel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });
        } else {
          logger.error({
            message: 'Failed to handle spoiler attachments request',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });
        }

        const content: MessageEditOptions = {
          embeds: [buildEmbed(message, 'RED')],
          components: []
        };

        await Promise.all([promptMessage.edit(content), interaction.editReply(content)]);
      }

      delete busy[interaction.user.id];
    }
  ),
  additionalHandlers: {
    async interactionCreate (client: Client, interaction: Interaction): Promise<void> {
      if (!interaction.isButton() || !interaction.customId.startsWith('delete-spoilers')) {
        return;
      }

      const [, channelId, messageId] = interaction.customId.split('.');
      const channel = await client.channels.fetch(channelId) as TextChannel;
      try {
        const message = await channel.messages.fetch(messageId);

        await message.delete();
      } catch (error) {
        if (error.code !== 10008) {
          logger.error({
            message: 'Failed to delete attachments message',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${channel.name}`,
              guild: interaction.guildId,
              messageId: messageId
            }
          });

          await interaction.update({
            embeds: [buildEmbed('An error occurred while trying to delete the message.', 'RED')],
            components: []
          });

          return;
        }
      }

      await interaction.update({
        embeds: [buildEmbed('The message for these attachments has been deleted!')],
        components: []
      });
    }
  }
};
