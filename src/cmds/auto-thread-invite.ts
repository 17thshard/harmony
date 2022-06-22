import { ComplexCommand } from '../commands';
import {
  AnyChannel,
  Client,
  ColorResolvable,
  CommandInteraction, GuildChannel,
  MessageEmbed,
  Permissions,
  Role,
  Snowflake,
  TextChannel,
  ThreadChannel
} from 'discord.js';
import { guilds as storage } from '../utils/storage';
import logger from '../utils/logger';

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
        const channel = client.channels.resolve(interaction.options.getChannel('channel', true).id) as GuildChannel;
        const role = interaction.options.getRole('role', true);

        if (!channel.isText() || channel.isThread()) {
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

        const channelStorage = storage.channels(interaction.guildId);
        const storedRoles = channelStorage.get(channel.id, 'autoThreadInvite', v => v, {});
        if (storedRoles[role.id] === true) {
          await interaction.reply({
            embeds: [buildEmbed(`${role} members are already automatically added to new threads in ${channel}!`)],
            allowedMentions: {
              parse: []
            }
          });
          return;
        }

        try {
          storedRoles[role.id] = true;
          channelStorage.set(channel.id, 'autoThreadInvite', storedRoles);
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
        const channel = client.channels.resolve(interaction.options.getChannel('channel', true).id) as GuildChannel;
        const role = interaction.options.getRole('role', true);

        if (channel.isText() && !channel.permissionsFor(interaction.user).has(Permissions.FLAGS.MANAGE_THREADS)) {
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

        const channelStorage = storage.channels(interaction.guildId);
        const storedRoles = channelStorage.get(channel.id, 'autoThreadInvite', v => v, {});
        if (storedRoles[role.id] !== true) {
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
          delete storedRoles[role.id];

          if (Object.keys(role.id).length === 0) {
            channelStorage.delete(channel.id, 'autoThreadInvite');
          } else {
            channelStorage.set(channel.id, 'autoThreadInvite', storedRoles);
          }
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
          const channelsWithRoles = storage.channels(interaction.guildId).list<Record<Snowflake, boolean>>('autoThreadInvite');
          const resolvedRoles = await Promise.all(Object.keys(channelsWithRoles).map(async (key) => {
            const channel = await client.channels.fetch(key);
            const roles = channelsWithRoles[key];
            const resolved = await Promise.all(
              Object.keys(roles).filter(id => roles[id] === true).map(id => interaction.guild.roles.fetch(id))
            );

            return { channel, roles: resolved };
          }));

          const grouped = resolvedRoles.reduce(
            (acc, item) => {
              acc[item.channel.id.toString()] = item.roles.map(role => ({ channel: item.channel, role }));
              return acc;
            },
            {} as Record<string, Array<{ channel: AnyChannel, role: Role }>>
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
      const storedRoles = storage.channels(thread.guildId).get(thread.parentId, 'autoThreadInvite', v => v, {});
      const roles = await Promise.all(
        Object.keys(storedRoles).filter(key => storedRoles[key] === true).map(key => thread.guild.roles.fetch(key))
      );

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
