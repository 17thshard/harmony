import { ActionRowBuilder, ChannelSelectMenuBuilder, ModalActionRowComponentBuilder } from '@discordjs/builders';
import { ChannelType, ComponentType, Snowflake, TextInputStyle } from 'discord-api-types/v10';
import {
  Client,
  DiscordjsError,
  DiscordjsErrorCodes,
  MessageContextMenuCommandInteraction,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  WebhookClient
} from 'discord.js';
import { Module } from '../bot';
import { SimpleCommand } from '../commands';
import logger from '../utils/logger';

const supportedWebhooks = (process.env.EDITABLE_WEBHOOKS ?? '').split(',').map(hook => hook.trim()).reduce((acc, url) => {
  if (url.length === 0) {
    return acc;
  }

  const webhookClient = new WebhookClient({ url });
  acc[webhookClient.id] = webhookClient;
  return acc;
}, {} as Record<Snowflake, WebhookClient>);

export default {
  commands: [
    new SimpleCommand(
      'Edit Webhook Message',
      async (
        client: Client,
        interaction: MessageContextMenuCommandInteraction<'cached'>
      ) => {
        const message = interaction.targetMessage;
        const webhook = supportedWebhooks[message.webhookId];
        if (!webhook) {
          await interaction.reply({ content: 'Can only edit messages from supported webhooks!', ephemeral: true });
          return;
        }

        const modalId = `edit-webhook-${interaction.user.id}-${interaction.targetId}`;
        const modal = new ModalBuilder()
          .setCustomId(modalId)
          .setTitle('Edit Webhook Message')
          .addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>()
              .addComponents(
                new TextInputBuilder()
                  .setCustomId('content')
                  .setLabel('Content')
                  .setStyle(TextInputStyle.Paragraph)
                  .setValue(message.content)
                  .setRequired(true)
              )
          );

        await interaction.showModal(modal);

        const filter = (interaction: ModalSubmitInteraction) => interaction.customId === modalId;
        let newContent = message.content;
        let answer: ModalSubmitInteraction<'cached'>;
        try {
          answer = await interaction.awaitModalSubmit({
            filter,
            time: 300_000
          });
          newContent = answer.fields.getTextInputValue('content').trim();
        } catch (error) {
          if (error instanceof DiscordjsError && error.code === DiscordjsErrorCodes.InteractionCollectorError) {
            return;
          }
          throw error;
        }

        try {
          await webhook.editMessage(interaction.targetMessage, { content: newContent });
        } catch (error) {
          logger.error({
            message: 'Failed to edit webhook message',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${message.channel.name}`,
              guild: interaction.guildId
            }
          });
          await answer.reply({ content: 'Failed to edit webhook message', ephemeral: true });
          return;
        }

        await answer.reply({ content: 'Webhook message successfully edited', ephemeral: true });
      }
    ),
    new SimpleCommand(
      'Add Channel Directions',
      async (
        client: Client,
        interaction: MessageContextMenuCommandInteraction<'cached'>
      ) => {
        const message = interaction.targetMessage;
        const webhook = supportedWebhooks[message.webhookId];
        if (!webhook) {
          await interaction.reply({ content: 'Can only edit messages from supported webhooks!', ephemeral: true });
          return;
        }

        await interaction.deferReply({ ephemeral: true });

        const selectId = `channel-directions-${interaction.user.id}-${interaction.targetId}`;
        const row = new ActionRowBuilder<ChannelSelectMenuBuilder>()
          .addComponents(
            new ChannelSelectMenuBuilder()
              .setCustomId(selectId)
              .setChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.GuildForum)
          );
        const reply = await interaction.editReply({ content: 'Which channel should conversation be directed to?', components: [row] });
        let targetChannel: string;
        try {
          targetChannel = (await reply.awaitMessageComponent({ componentType: ComponentType.ChannelSelect, time: 60_000 })).values[0];
        } catch (error) {
          if (error instanceof DiscordjsError && error.code === DiscordjsErrorCodes.InteractionCollectorError) {
            await interaction.editReply({ content: 'Did not receive response in time!', components: [] });
            return;
          }
          throw error;
        }
        let content = message.content;
        const cta = `-# Want to talk about this? Go to <#${targetChannel}>!`;
        const regex = /^-# Want to talk about this\? Go to <#[0-9]+>!/m;
        if (content.match(regex)) {
          content = content.replace(regex, cta);
        } else {
          content = `${content}\n\n${cta}`;
        }

        try {
          await webhook.editMessage(interaction.targetMessage, { content });
        } catch (error) {
          logger.error({
            message: 'Failed to edit webhook message',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${message.channel.name}`,
              guild: interaction.guildId
            }
          });
          await interaction.editReply({ content: 'Failed to edit webhook message', components: [] });
          return;
        }

        await interaction.editReply({ content: 'Webhook message successfully edited', components: [] });
      }
    )
  ]
} as Module;
