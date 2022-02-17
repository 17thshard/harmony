import { Client, CommandInteraction, GuildTextBasedChannel, MessageOptions, NewsChannel, TextChannel, Webhook } from 'discord.js';
import { SimpleCommand } from './commands';
import logger from './logger';
import { MessageResolveError, patterns, resolveMessageLink } from './message-utils';
import { guilds as storage } from './storage';

async function getWebhook(channel: TextChannel | NewsChannel): Promise<Webhook> {
  const guildId = channel.guildId;
  const channelId = channel.id;
  const client = channel.client;

  storage.channels(guildId);
  const stored: string = storage.channels(guildId).get(channelId, 'webhook');
  if (stored) return client.fetchWebhook(stored);
  else {
    const webhook = await channel.createWebhook(channel.guild.name, {
      avatar: channel.guild.iconURL(),
      reason: 'Harmony mod message sending'
    });
    storage.channels(guildId).set(channelId, 'webhook', webhook.id);
    return webhook;
  }
}

const handlers = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async send(client: Client, interaction: CommandInteraction): Promise<any> {
    await interaction.deferReply({ ephemeral: true });
    const content = interaction.options.getString('content', true);

    const editLink = interaction.options.getString('edit-link');
    const webhookArg = interaction.options.getString('webhook-id');
    const channel = interaction.options.getChannel('channel');
    if ((editLink && webhookArg) || (editLink && channel) || (webhookArg && channel)) {
      return await interaction.editReply('Destination-setting options cannot be used alongside each other.');
    }
    const webhookId = (webhookArg) ? patterns.webhook.match(webhookArg).groups?.webhookId ?? null : undefined;
    if (webhookId === null) return await interaction.editReply('`webhook-id` does not point to a valid webhook!');

    let message;
    if (editLink) try {
      message = await resolveMessageLink(client, editLink, { asUser: interaction.user });
      if (!message.webhookId || message.guildId !== interaction.guildId) throw new MessageResolveError('');
    } catch (e) {
      if (e instanceof MessageResolveError) {
        return await interaction.editReply('`edit-link` does not point to a valid message!');
      } else throw e;
    }

    const webhook = editLink
      ? await message.fetchWebhook()
      : webhookId
        ? await interaction.client.fetchWebhook(webhookId)
        : await getWebhook((channel ?? interaction.channel) as TextChannel);

    if (webhook.type === 'Channel Follower') return await interaction.editReply('Cannot use channel follower webhooks.');

    //const attachment = interaction.options.getAttachment('attachment');
    //const avatarImg = interaction.options.getAttachment('avatar');

    const parsed: MessageOptions = (content.startsWith('RAW:{'))
      ? JSON.parse(content.replace('RAW:', ''))
      : { content: content.replaceAll('   ', '\n') };

    logger.info({
      message: `Sending message from ${interaction.user.tag}`,
      context: {
        sourceChannel: `#${(interaction.channel as GuildTextBasedChannel).name}`,
        sentChannel: webhook.channelId,
        guild: interaction.guildId,
        webhook: webhook.url,
        editLink,
      }
    });

    const username = interaction.options.getString('username');
    const avatarURL = /*avatarImg?.url??*/ interaction.options.getString('avatar-link');
    if (editLink) {
      if (avatarURL || username) return await interaction.editReply('`edit-link` cannot be used alongside appearance options.');
      else await webhook.editMessage(message, parsed);
    } else {
      await webhook.send({
        ...parsed,
        username: username ?? interaction.guild.name,
        avatarURL: avatarURL ?? interaction.guild.iconURL(),
        //attachments: [attachment],
      });
    }

    await interaction.editReply('Sent!');
  }
};

/**
 * Easy-to-use variant of the command. Should accept only two options: `content` (required) and `edit-link` (optional).
 */
export const simple = {
  command: new SimpleCommand(
    'mod',
    handlers.send
  )
};

/**
 * Full version of the command, which is far more flexible but far more complicated.
 * 
 * Note: Only difference here is the name, deploy metadata is where the main differences are.
 */
export const full = {
  command: new SimpleCommand(
    'webhook',
    handlers.send
  )
};
