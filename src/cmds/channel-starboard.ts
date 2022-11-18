import { ButtonBuilder } from '@discordjs/builders';
import { ButtonStyle, ComponentType } from 'discord-api-types/v10';
import { Channel, ChatInputCommandInteraction, GuildChannel, Snowflake, Webhook, WebhookMessageOptions } from 'discord.js';
import { Module } from '../bot';
import { ComplexCommand } from '../commands';
import logger from '../utils/logger';
import { guilds as storage } from '../utils/storage';

const threadStorageKey = 'starboard-thread';
const webhookStorageKey = 'starboard-webhook';

type WebhookCapableChannel = Extract<Channel, { fetchWebhooks(): unknown }>;
type ThreadsCapableChannel = Extract<Channel, { threads: unknown }>;
type StarboardCapableChannel = WebhookCapableChannel & ThreadsCapableChannel;
function isStarboardCapable(channel: Channel): channel is StarboardCapableChannel {
  return 'threads' in channel && 'fetchWebhooks' in channel;
}

// todo: may be worthwhile to centralize webhook creation if we go ahead with the modhat command
async function getUsableWebhook(channel: WebhookCapableChannel): Promise<Webhook> {
  const guildStorage = storage.channels(channel.guildId);
  const stored = guildStorage.get<Snowflake>(channel.id, webhookStorageKey);
  if (stored) {
    // ensure webhook still exists before returning it
    const webhook = await channel.client.fetchWebhook(stored).catch<Webhook | null>(() => null);
    if (webhook !== null) return webhook;
  }

  // find a webhook this bot owns, or create a new one
  const botUser = channel.client.user;
  const webhook = await channel.fetchWebhooks()
    .then(whs => whs.find(wh => wh.owner?.id === botUser.id))
    ?? await channel.createWebhook({ name: botUser.username, avatar: botUser.displayAvatarURL() });

  guildStorage.set(channel.id, webhookStorageKey, webhook.id);
  return webhook;
}

export default {
  command: new ComplexCommand('manage-channel-starboard', {
    set: async (client, interaction: ChatInputCommandInteraction<'cached'>) => {
      const channel = interaction.options.getChannel('channel') ?? interaction.channel;
      if (!isStarboardCapable(channel)) {
        await interaction.reply({
          content: 'Can only create a starboard for channels that support both threads and webhooks!',
          ephemeral: true,
        });
        return;
      }

      const thread = interaction.options.getChannel('thread', true);
      if (!thread.isThread() || thread.parentId !== channel.id) {
        await interaction.reply({
          content: `Starboard must be a thread under <#${channel.id}>!`,
          ephemeral: true,
        });
        return;
      }

      const guildStorage = storage.channels(interaction.guildId);
      guildStorage.set(channel.id, threadStorageKey, thread.id);
      await interaction.reply(`Set starboard for <#${channel.id}> to <#${thread.id}>.`);

      // open a webhook if necessary
      await getUsableWebhook(channel);
    },

    remove: async (client, interaction: ChatInputCommandInteraction<'cached'>) => {
      const channelId = interaction.options.getChannel('channel', false)?.id ?? interaction.channelId;
      const guildStorage = storage.channels(interaction.guildId);
      if (guildStorage.get(channelId, threadStorageKey) === null) {
        await interaction.reply(`<#${channelId}> has no starboard set up!`);
        return;
      }

      guildStorage.delete(channelId, threadStorageKey);
      await interaction.reply(`Disabled starboard for <#${channelId}>.`);
    },
  }),

  additionalHandlers: {
    messageReactionAdd: async (client, reaction, pinner) => {
      if (reaction.emoji.name !== '📌') return;

      const channelId = reaction.message.channel.isThread()
        ? reaction.message.channel.parentId
        : reaction.message.channelId;

      const starThreadId = storage.channels(reaction.message.guildId).get<string>(channelId, threadStorageKey);
      if (starThreadId === null) return;

      // system messages ("x pinned a message", "x created a thread") have no meaningful accessible content to pin
      if (reaction.message.system) return;

      // only send if this is the first reaction, to not spam
      // easy to abuse, but this is meant for internal use atm so can assume good faith
      reaction = reaction.partial ? await reaction.fetch() : reaction;
      if (reaction.count !== 1) return;
      
      const message = reaction.message.partial ? await reaction.message.fetch(true) : reaction.message;
      logger.info({
        message: `Pinning a message at the behest of ${pinner.tag}...`,
        context: {
          message: message.url,
          channel: (message.channel as GuildChannel).name,
          guild: message.guildId
        }
      });

      const notificationMessage = await message.reply({
        content: 'Pinning...',
        allowedMentions: { users: [] },
      });

      let username, avatarURL;
      if (message.webhookId) {
        username = message.author.username;
        try {
          // webhook messages lack `avatarURL`, so get webhook's avatar
          const webhook = await message.fetchWebhook();
          avatarURL = webhook.avatarURL();
        } catch {
          // if webhook cannot be fetched, use defaultAvatarURL, which message.author _does_ provide
          avatarURL = message.author.defaultAvatarURL;
        }
      } else {
        // handle partials by fetching author if necessary
        const author = message.member ?? await message.guild.members.fetch(message.author.id);
        username = author.displayName;
        avatarURL = author.displayAvatarURL();
      }

      const clonedMessage: WebhookMessageOptions = {
        username,
        avatarURL,
        allowedMentions: { roles: [], users: [], },
        threadId: starThreadId,

        content: message.content || undefined,
        components: message.components ?? [],
        files: message.attachments.map(v => v), // convert collection to array
        flags: message.flags.has('SuppressEmbeds') ? ['SuppressEmbeds'] : [],
      };

      // copying embeds ruins any non-rich embeds, so only copy over if there are none of those
      if (message.embeds.findIndex(embed => embed.data.type !== 'rich') === -1) {
        clonedMessage.embeds = message.embeds;
      }

      const jumpButton = new ButtonBuilder()
        .setURL(message.url)
        .setStyle(ButtonStyle.Link)
        .setLabel('Jump to Original');

      // can only have five rows, so if there's already five, pop one off to make room
      if (clonedMessage.components.length === 5) {
        clonedMessage.components.pop();
      }
      clonedMessage.components.push({ type: ComponentType.ActionRow, components: [jumpButton.toJSON()] });

      // assume it's valid because it has to be checked before a thread is stored
      const channel = await client.channels.fetch(channelId) as StarboardCapableChannel;
      await getUsableWebhook(channel).then(wh => wh.send(clonedMessage));
      
      await notificationMessage.edit({
        content: `<@${pinner.id}> pinned this message to this channel's starboard. See all pinned messages: <#${starThreadId}>`,
        allowedMentions: { users: [] },
      });
    }
  }
} as Module;
