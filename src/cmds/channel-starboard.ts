import { EmbedBuilder } from '@discordjs/builders';
import { GuildChannel, MessageOptions, Snowflake, ThreadChannel } from 'discord.js';
import { Module } from '../bot';
import { ComplexCommand } from '../commands';
import logger from '../utils/logger';
import { guilds as storage } from '../utils/storage';

const threadStorageKey = 'starboard-thread';

export default {
  command: new ComplexCommand('manage-channel-starboard', {
    set: async (client, interaction) => {
      const channelId = interaction.options.getChannel('channel', false)?.id ?? interaction.channelId;
      const thread = interaction.options.getChannel('thread', true) as GuildChannel;
      if (!thread.isThread() || thread.parentId !== channelId) {
        await interaction.reply(`Starboard must be a thread under <#${channelId}>!`);
        return;
      }

      storage.channels(interaction.guildId).set(channelId, threadStorageKey, thread.id);
      await interaction.reply(`Set starboard for <#${channelId}> to <#${thread.id}>.`);
      return;
    },

    remove: async (client, interaction) => {
      const channelId = interaction.options.getChannel('channel', false)?.id ?? interaction.channelId;
      const guildStorage = storage.channels(interaction.guildId);
      if (!guildStorage.get(channelId, threadStorageKey)) {
        await interaction.reply(`<#${channelId}> has no starboard set up!`);
        return;
      }

      guildStorage.delete(channelId, threadStorageKey);
      await interaction.reply(`Disabled starboard for <#${channelId}>.`);
      return;
    }
  }),

  additionalHandlers: {
    messageReactionAdd: async (client, reaction, pinner) => {
      // only send if this is the first reaction, to not spam
      if (reaction.emoji.name !== '📌' || reaction.count > 1) {
        return;
      }

      // if this channel doesn't support threads, we can't do anything
      if (!('threads' in reaction.message.channel)) {
        return;
      }

      // check if this channel has a starboard enabled, and if so fetch it
      const threadId = storage.channels(reaction.message.guildId).get<string>(reaction.message.channelId, threadStorageKey);
      if (!threadId) {
        return;
      }
      const thread = await reaction.message.channel.threads.fetch(threadId);

      // force fetch message if needed so we can support uncached messages
      const message = reaction.message.partial ? await reaction.message.fetch(true) : reaction.message;
      
      // system messages ("x pinned a message", "x created a thread") have no meaningful accessible content to pin
      if (message.system) {
        return;
      }
      
      logger.info({
        message: `Pinning a message at the behest of ${pinner.tag}...`,
        context: {
          message: message.url,
          channel: (message.channel as GuildChannel).name,
          guild: message.guildId
        }
      });

      // used for the author, message link, plain text content, and an optional single image
      const mainEmbed = new EmbedBuilder();

      // used for spare attachments or embedded gifs, so that they go below the embed rather than above
      const backupMessage = {} as MessageOptions;

      // set author and link to the original message to make it easy to find the source
      try {
        const author = await message.guild.members.fetch(message.author.id);
        mainEmbed.setAuthor({
          name: author.displayName,
          iconURL: author.displayAvatarURL(),
          url: message.url,
        });
      } catch {
        // if the author isn't a real account, it's probably a webhook
        const webhook = await message.fetchWebhook();
        mainEmbed.setAuthor({
          name: webhook.name,
          iconURL: webhook.avatarURL(),
          url: message.url,
        });
      }

      // tenor gifs should be sent on their own so Discord embeds them
      if (message.content.match(/https:\/\/tenor.com\/(\w|-)+/)) {
        backupMessage.content = message.content;
      } else if (message.content) {
        mainEmbed.setDescription(message.content);
      }

      // embeds can contain exactly one image attachment, use followup message if that's not enough
      if (message.attachments.size === 1 && message.attachments.at(0).contentType.startsWith('image/')) {
        mainEmbed.setImage(message.attachments.at(0).url);
      } else if (message.attachments.size > 0) {
        backupMessage.files = Array.from(reaction.message.attachments.values());
      }

      // send the main embed before sending anything else
      await thread.send({ embeds: [mainEmbed.toJSON()] });

      // if anything needs to be sent in the followup, do so now
      if (Object.keys(backupMessage).length > 0) {
        await thread.send(backupMessage);
      }

      // send a notification to the origin channel, mimicking the default pin style as closely as we can
      await message.reply({
        content: `<@${pinner.id}> pinned this message to this channel's starboard. View all pinned messages: <#${thread.id}>`,
        allowedMentions: { users: [] },
      });
    }
  }
} as Module;
