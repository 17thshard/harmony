import { ComplexCommand } from './commands';
import {
  Channel,
  Client,
  ColorResolvable,
  CommandInteraction,
  MessageEmbed,
  Permissions,
  Role,
  TextChannel,
  ThreadChannel
} from 'discord.js';
import storage from './storage';
import logger from './logger';

function buildStorageKey (guild: string, channel: string, role: string) {
  return `autoThreadInvite.${guild}.${channel}.${role}`;
}

function buildEmbed (message: string, color?: ColorResolvable): MessageEmbed {
  const embed = new MessageEmbed()
    .setTitle('Auto Thread Invite')
    .setDescription(message);

  if (color !== undefined) {
    embed.setColor(color);
  }

  return embed;
}

export default {
  command: new ComplexCommand(
    'auto-thread-invite',
    {
      async start (client: Client, interaction: CommandInteraction) {
        const channel = interaction.options.getChannel('channel', true);
        const role = interaction.options.getRole('role', true);

        if (channel.type !== 'GUILD_TEXT') {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `${channel} is not a text channel and does not support threads!`,
                'RED'
              )
            ]
          });
          return;
        }

        if (!channel.permissionsFor(interaction.user).has(Permissions.FLAGS.MANAGE_THREADS)) {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `Cannot watch ${channel} for automatic thread invites, you do not have permissions to manage threads there!`,
                'RED'
              )
            ]
          });
          return;
        }

        const storageKey = buildStorageKey(interaction.guildId, channel.id, role.id);
        if (storage.get(storageKey) === true) {
          await interaction.reply({
            embeds: [buildEmbed(`${role} members are already automatically added to new threads in ${channel}!`)],
            allowedMentions: {
              parse: []
            }
          });
          return;
        }

        try {
          storage.set(storageKey, true);
        } catch (error) {
          const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
          logger.error({
            message: 'Could not add channel and role to auto-thread-invite list',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${sourceChannel.name}`,
              role: `@${role.name}`,
              targetchannel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });

          await interaction.reply({
            embeds: [
              buildEmbed(
                `An error occurred while trying to start watching threads in ${channel}`,
                'RED'
              )
            ]
          });

          return;
        }

        logger.info(`Started watching channel #${channel.name} on guild ${interaction.guildId} for new threads to add @${role.name} members`);

        await interaction.reply({
          embeds: [buildEmbed(`${role} members will now be automatically invited to new threads in ${channel}!`)],
          allowedMentions: { parse: [] }
        });
      },
      async stop (client: Client, interaction: CommandInteraction) {
        const channel = interaction.options.getChannel('channel', true);
        const role = interaction.options.getRole('role', true);

        if (channel.type === 'GUILD_TEXT' && !channel.permissionsFor(interaction.user).has(Permissions.FLAGS.MANAGE_THREADS)) {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `You must be able to manage threads in ${channel} to manage thread auto invites there!`,
                'RED'
              )
            ]
          });
          return;
        }

        const storageKey = buildStorageKey(interaction.guildId, channel.id, role.id);
        if (storage.get(storageKey) !== true) {
          await interaction.reply({
            embeds: [
              buildEmbed(
                `${role} members are not automatically invited to new threads in ${channel}!`,
                'RED'
              )
            ],
            allowedMentions: { parse: [] }
          });
          return;
        }

        try {
          storage.delete(buildStorageKey(interaction.guildId, channel.id, role.id));
        } catch (error) {
          const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
          logger.error({
            message: 'Could not remove channel and role from auto-thread-invite list',
            error,
            context: {
              user: interaction.user.tag,
              channel: `#${sourceChannel.name}`,
              role: `@${role.name}`,
              targetchannel: `#${channel.name}`,
              guild: interaction.guildId
            }
          });

          await interaction.reply({ embeds: [buildEmbed(`An error occurred while trying to stop watching threads in ${channel}`, 'RED')] });

          return;
        }

        logger.info(`Stopped watching channel #${channel.name} on guild ${interaction.guildId} for new threads to add @${role.name} members`);

        await interaction.reply({
          embeds: [buildEmbed(`${role} members will no longer be automatically invited to new threads in ${channel}!`)],
          allowedMentions: { parse: [] }
        });
      },
      async list (client: Client, interaction: CommandInteraction) {
        try {
          const filterChannel = interaction.options.getChannel('channel', false);
          const prefix = `autoThreadInvite.${interaction.guildId}.`;
          const keys = storage.keys().filter(key => key.startsWith(prefix) && storage.get(key) === true);
          const grouped = (await Promise.all(keys.map(async key => {
            const lastDotIndex = key.lastIndexOf('.');
            const channel = await client.channels.fetch(key.substring(prefix.length, lastDotIndex));
            const role = await interaction.guild.roles.fetch(key.substring(lastDotIndex + 1));

            return { channel, role };
          }))).reduce(
            (acc, item) => {
              if (acc[item.channel.id.toString()] === undefined) {
                acc[item.channel.id.toString()] = [];
              }
              acc[item.channel.id.toString()].push(item);
              return acc;
            },
            {} as Record<string, Array<{ channel: Channel, role: Role }>>
          );

          const instructionMessage = 'To start inviting role members to new threads in a channel, use the \`/auto-thread-invite start #channel @role\` command.\nTo stop inviting role members, use the \`/auto-thread-invite stop #channel @role\` command';
          if (filterChannel !== null) {
            const list = grouped[filterChannel.id.toString()].map(item => ` • ${item.role}`);
            const baseMessage = list.length > 0
              ? `Currently, the following roles are automatically invited to new threads in ${filterChannel}:\n${list.join('\n')}`
              : `Currently, no roles are automatically invited to new threads in ${filterChannel}.`;

            await interaction.reply({
              embeds: [buildEmbed(`${baseMessage}\n\n${instructionMessage}`)],
              allowedMentions: { parse: [] }
            });
          } else {
            const list = Object.keys(grouped).map(key => {
              const items = grouped[key];
              const itemList = items.map(item => item.role);

              return ` • ${items[0].channel}: ${itemList.join(', ')}`;
            });
            const baseMessage = list.length > 0
              ? `Currently, the following roles are automatically invited to new threads in these channels:\n${list.join('\n')}`
              : 'Currently, no roles are automatically invited to new threads in any channel.';

            await interaction.reply({
              embeds: [buildEmbed(`${baseMessage}\n\n${instructionMessage}`)],
              allowedMentions: { parse: [] }
            });
          }
        } catch (error) {
          logger.error({
            message: 'Could not retrieve channels from storage',
            error,
            context: {
              user: interaction.user.tag,
              guild: interaction.guildId
            }
          });

          await interaction.reply({ embeds: [buildEmbed('An error occurred while trying to list all watched channels', 'RED')] });
        }
      }
    }
  ),
  additionalHandlers: {
    async threadCreate (client: Client, thread: ThreadChannel): Promise<void> {
      const prefix = `autoThreadInvite.${thread.guildId}.${thread.parent.id}.`;
      const keys = storage.keys().filter(key => key.startsWith(prefix) && storage.get(key) === true);
      const roles = await Promise.all(keys.map(key => thread.guild.roles.fetch(key.substring(prefix.length))));

      if (roles.length === 0) {
        return;
      }

      try {
        logger.info({
          message: `Auto-inviting ${roles.length} roles to new thread...`,
          context: {
            channel: `#${thread.parent.name}`,
            guild: thread.guildId
          }
        });

        await thread.send({ content: `Auto-inviting ${roles.join(', ')}` });

        logger.info({
          message: `Auto-invited ${roles.length} roles to new thread`,
          context: {
            channel: `#${thread.parent.name}`,
            guild: thread.guildId
          }
        });
      } catch (error) {
        logger.error({
          message: `Failed to auto-invite ${roles.length} roles to new thread`,
          error,
          context: {
            channel: `#${thread.parent.name}`,
            guild: thread.guildId
          }
        });
      }
    }
  }
};
