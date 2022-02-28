import { Client, ColorResolvable, CommandInteraction, Message, MessageEmbed, PartialMessage, Snowflake, TextChannel } from 'discord.js';
import IntervalTree from 'node-interval-tree';
import { escape, sanitize } from '../../utils/message-utils';
import { deserialize as deserializeFilter, MessageFilter } from './filters';
import { guilds } from '../../utils/storage';
import { ComplexCommand } from '../../commands';
import logger from '../../utils/logger';
import { deserialize as deserializeExemption, MessageFilterExemption } from './exemptions';

type FilterCollection = { allowed: Array<MessageFilter>, forbidden: Array<MessageFilter> }
const collections = guilds.view<FilterCollection>(
  'messageFilter.collections',
  raw => ({ allowed: raw.allowed.map(deserializeFilter), forbidden: raw.forbidden.map(deserializeFilter) })
);
const exemptions = guilds.view<Array<MessageFilterExemption>>('messageFilter.exemptions', raw => raw.map(deserializeExemption));

function buildEmbed (message: string, color?: ColorResolvable): MessageEmbed {
  const embed = new MessageEmbed()
    .setTitle('Message Filter')
    .setDescription(message);

  if (color !== undefined) {
    embed.setColor(color);
  }

  return embed;
}

async function filter (client: Client, message: Message | PartialMessage): Promise<void> {
  // Always ignore self and non-guild messages
  if (message.author.id === client.user.id || message.channel.type === 'DM') {
    return;
  }

  const filterCollection = collections.get(message.guildId);
  if (filterCollection === null || filterCollection.forbidden.length === 0) {
    return;
  }

  const guildExemptions = exemptions.get(message.guildId, []);
  if (guildExemptions.some(e => e.test(message))) {
    return;
  }

  const sanitizedContent = sanitize(message.content).toLowerCase();
  const allowed = new IntervalTree();
  filterCollection.allowed.flatMap(filter => filter.match(sanitizedContent)).forEach(match => {
    allowed.insert(match.interval.low, match.interval.high, null);
  });
  const forbidden = filterCollection.forbidden
    .flatMap(filter => filter.match(sanitizedContent).map(result => ({ result, filter })))
    .filter(({ result }) => allowed.search(result.interval.low, result.interval.high).length == 0);

  if (forbidden.length === 0) {
    return;
  }

  try {
    await message.delete();
  } catch (error) {
    logger.error({
      message: `Could not delete message ${message.id} by ${message.author.tag} in #${message.channel.name} on ${message.guildId}`,
      error
    });
  }

  let notifiedUser = true;
  try {
    await message.author.send({
      embeds: [
        new MessageEmbed()
          .setTitle('Message Filter')
          .setDescription(`Your message in ${message.channel} was deleted due to containing forbidden words.\nIf you wish to repost it without banned words, here is the original markup:\n\n${escape(
            message.content)}`)
          .setColor('RED')
          .setFooter('Message filtered')
          .setTimestamp(new Date())
      ],
      allowedMentions: { parse: [] }
    });
  } catch (error) {
    notifiedUser = false;
    logger.error({
      message: `Could not notify user ${message.author.tag} of message deletion`,
      error
    });
  }

  logger.info(`Filtered out message by ${message.author.tag} in #${message.channel.name} on ${message.guildId}`);

  const loggingChannelId = guilds.get<Snowflake>(message.guildId, 'messageFilter.loggingChannel');
  if (loggingChannelId === null) {
    return;
  }

  const loggingChannel = await client.channels.fetch(loggingChannelId) as TextChannel;
  const afterEditMessage = message.editedAt !== null ? ' after edit' : '';
  const appliedFilters = Object.values(
    forbidden.reduce(
      (acc, { filter }) => {
        const serialized = filter.toJSON();
        acc[`${serialized.type}.${serialized.filter}`] = ` • ${filter.describe()}`;
        return acc;
      },
      {} as Record<string, string>
    )
  ).join('\n');
  await loggingChannel.send({
    embeds: [
      new MessageEmbed()
        .setTitle('Message Filter')
        .setDescription(`Message by ${message.author} deleted from ${message.channel}${afterEditMessage}.\n\nApplied filters:\n${appliedFilters}`)
        .setTimestamp(message.editedAt !== null ? message.editedAt : message.createdAt)
        .setFooter(notifiedUser ? '' : 'Could not send notification DM to user')
    ],
    allowedMentions: { parse: [] }
  });
}

function buildFilterManagement (collectionType: keyof FilterCollection) {
  return {
    async add (client: Client, interaction: CommandInteraction) {
      const type = interaction.options.getString('type', true);
      const content = interaction.options.getString('filter', true);

      const storedCollection = collections.get(interaction.guildId, { allowed: [], forbidden: [] });
      if (storedCollection[collectionType].some(f => {
        const serialized = f.toJSON();
        return serialized.type === type && serialized.filter === content;
      })) {
        await interaction.reply({
          embeds: [
            buildEmbed(`This '${type}' filter already exists!`, 'RED')
          ],
          ephemeral: true
        });

        return;
      }

      try {
        const filter = deserializeFilter({ type, filter: content });
        storedCollection[collectionType].push(filter);
        collections.set(interaction.guildId, storedCollection);
      } catch (error) {
        const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
        logger.error({
          message: `Could not add '${type}' filter '${content}' to ${collectionType} filters`,
          error,
          context: {
            user: interaction.user.tag,
            channel: `#${sourceChannel.name}`,
            guild: interaction.guildId
          }
        });

        await interaction.reply({
          embeds: [
            buildEmbed(
              `An error occurred while trying to add the filter of type '${type}':\n\`\`\`${escape(content)}\`\`\``,
              'RED'
            )
          ]
        });

        return;
      }

      logger.info(`Filter added to ${collectionType} collection for guild ${interaction.guildId}: ${type} - ${content}`);

      await interaction.reply({
        embeds: [buildEmbed(`Messages matching the following '${type}' filter will now be ${collectionType}!\n\`\`\`${escape(content)}\`\`\``)],
        allowedMentions: { parse: [] }
      });
    },
    async delete (client: Client, interaction: CommandInteraction) {
      const type = interaction.options.getString('type', true);
      const content = interaction.options.getString('filter', true);

      let affected = 0;
      try {
        const storedCollection = collections.get(interaction.guildId, { allowed: [], forbidden: [] });
        const filtered = storedCollection[collectionType].filter(filter => {
          const serialized = filter.toJSON();
          return serialized.type !== type || serialized.filter !== content;
        });
        affected = storedCollection[collectionType].length - filtered.length;
        storedCollection[collectionType] = filtered;
        collections.set(interaction.guildId, storedCollection);
      } catch (error) {
        const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
        logger.error({
          message: `Could not delete '${type}' filter '${content}' from ${collectionType} filters`,
          error,
          context: {
            user: interaction.user.tag,
            channel: `#${sourceChannel.name}`,
            guild: interaction.guildId
          }
        });

        await interaction.reply({
          embeds: [
            buildEmbed(
              `An error occurred while trying to delete the filter of type '${type}':\n\`\`\`${escape(content)}\`\`\``,
              'RED'
            )
          ]
        });

        return;
      }

      if (affected === 0) {
        const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
        logger.error({
          message: `No ${collectionType} '${type}' filter '${content}' found to be deleted`,
          context: {
            user: interaction.user.tag,
            channel: `#${sourceChannel.name}`,
            guild: interaction.guildId
          }
        });

        await interaction.reply({
          embeds: [
            buildEmbed(
              `There is no filter of type '${type}' matching:\n\`\`\`${escape(content)}\`\`\``,
              'RED'
            )
          ]
        });

        return;
      }

      logger.info(`Filter deleted from ${collectionType} collection for guild ${interaction.guildId}: ${type} - ${content}`);

      await interaction.reply({
        embeds: [
          buildEmbed(`Messages matching the following '${type}' filter will now no longer be ${collectionType}!\n\`\`\`${escape(content)}\`\`\``)
        ],
        allowedMentions: { parse: [] }
      });
    },
    async list (client: Client, interaction: CommandInteraction) {
      try {
        const storedCollection = collections.get(interaction.guildId, { allowed: [], forbidden: [] });
        const filters = storedCollection[collectionType];

        const instructionMessage = `To start filtering messages to be ${collectionType}, use the \`/message-filter ${collectionType} add\` command.\nTo delete a filter, use the \`/message-filter ${collectionType} delete\` command`;
        const list = filters.map(filter => {
          return ` • ${filter.describe()}`;
        });
        const baseMessage = list.length > 0
          ? `Currently, messages are being explicitly ${collectionType} based on these filters:\n${list.join('\n')}`
          : `Currently, no messages are explicitly ${collectionType}.`;

        await interaction.reply({
          embeds: [buildEmbed(`${baseMessage}\n\n${instructionMessage}`)],
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        logger.error({
          message: 'Could not retrieve message filters from storage',
          error,
          context: {
            user: interaction.user.tag,
            guild: interaction.guildId
          }
        });

        await interaction.reply({ embeds: [buildEmbed(`An error occurred while trying to list all ${collectionType} filters`, 'RED')] });
      }
    }
  };
}

export default {
  command: new ComplexCommand(
    'message-filter',
    {
      forbidden: buildFilterManagement('forbidden'),
      allowed: buildFilterManagement('allowed'),
      exemptions: {
        async add (client: Client, interaction: CommandInteraction) {
          const user = interaction.options.getUser('user', false);
          const role = interaction.options.getRole('role', false);
          const channel = interaction.options.getChannel('channel', false);
          const options = [user, role, channel].filter(o => o !== null);

          if (options.length !== 1) {
            await interaction.reply({
              embeds: [
                buildEmbed('You must provide exactly one of the options for exemptions!', 'RED')
              ],
              ephemeral: true
            });

            return;
          }

          const type = user !== null ? 'user' : role !== null ? 'role' : 'channel';
          const target = options[0].id;
          const storedExemptions = exemptions.get(interaction.guildId, []);

          if (storedExemptions.some(e => {
            const serialized = e.toJSON();
            return serialized.type === type && serialized.target === target;
          })) {
            await interaction.reply({
              embeds: [
                buildEmbed(`There already exists an exemption for this ${type}!`, 'RED')
              ],
              ephemeral: true
            });

            return;
          }

          const exemption = deserializeExemption({ type, target });

          try {
            storedExemptions.push(exemption);
            exemptions.set(interaction.guildId, storedExemptions);
          } catch (error) {
            const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
            logger.error({
              message: `Could not add exemption for ${type} with ID ${target}`,
              error,
              context: {
                user: interaction.user.tag,
                channel: `#${sourceChannel.name}`,
                guild: interaction.guildId
              }
            });

            await interaction.reply({
              embeds: [
                buildEmbed(
                  `An error occurred while trying to add the exemption for the ${type}`,
                  'RED'
                )
              ]
            });

            return;
          }

          logger.info(`Exemption added for ${type} with ID ${target} for guild ${interaction.guildId}`);

          await interaction.reply({
            embeds: [buildEmbed(`Messages for ${exemption.describe().toLowerCase()} are now exempt from message filters!`)],
            allowedMentions: { parse: [] }
          });
        },
        async delete (client: Client, interaction: CommandInteraction) {
          const user = interaction.options.getUser('user', false);
          const role = interaction.options.getRole('role', false);
          const channel = interaction.options.getChannel('channel', false);
          const options = [user, role, channel].filter(o => o !== null);

          if (options.length !== 1) {
            await interaction.reply({
              embeds: [
                buildEmbed('You must provide exactly one of the options for exemptions!', 'RED')
              ],
              ephemeral: true
            });

            return;
          }

          const type = user !== null ? 'user' : role !== null ? 'role' : 'channel';
          const target = options[0].id;
          const exemption = deserializeExemption({ type, target });

          let affected = 0;
          try {
            const storedExemptions = exemptions.get(interaction.guildId, []);
            const filtered = storedExemptions.filter(exemption => {
              const serialized = exemption.toJSON();
              return serialized.type !== type || serialized.target !== target;
            });
            affected = storedExemptions.length - filtered.length;
            exemptions.set(interaction.guildId, filtered);
          } catch (error) {
            const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
            logger.error({
              message: `Could not delete exemption for ${type} with ID ${target}`,
              error,
              context: {
                user: interaction.user.tag,
                channel: `#${sourceChannel.name}`,
                guild: interaction.guildId
              }
            });

            await interaction.reply({
              embeds: [
                buildEmbed(
                  `An error occurred while trying to delete the exemption for the ${type}`,
                  'RED'
                )
              ]
            });

            return;
          }

          if (affected === 0) {
            const sourceChannel = await client.channels.fetch(interaction.channelId) as TextChannel;
            logger.error({
              message: `No exemption for ${type} with ID ${target} found to be deleted`,
              context: {
                user: interaction.user.tag,
                channel: `#${sourceChannel.name}`,
                guild: interaction.guildId
              }
            });

            await interaction.reply({
              embeds: [
                buildEmbed(
                  `There is no exemption for this ${type}!`,
                  'RED'
                )
              ]
            });

            return;
          }

          logger.info(`Exemption deleted for ${type} with ID ${target} for guild ${interaction.guildId}`);

          await interaction.reply({
            embeds: [buildEmbed(`Messages for ${exemption.describe().toLowerCase()} are no longer exempt from message filters!`)],
            allowedMentions: { parse: [] }
          });
        },
        async list (client: Client, interaction: CommandInteraction) {
          try {
            const storedExemptions = exemptions.get(interaction.guildId, []);

            const instructionMessage = 'To exempt a target from message filters, use the `/message-filter exemptions add` command.\nTo no longer make a target exempt, use the `/message-filter exemptions delete` command';
            const list = storedExemptions.map(exemption => {
              return ` • ${exemption.describe()}`;
            });
            const baseMessage = list.length > 0
              ? `Currently, the following targets are exempt from message filters:\n${list.join('\n')}`
              : 'Currently, no targets are exempt from message filters.';

            await interaction.reply({
              embeds: [buildEmbed(`${baseMessage}\n\n${instructionMessage}`)],
              allowedMentions: { parse: [] }
            });
          } catch (error) {
            logger.error({
              message: 'Could not retrieve message filter exemptions from storage',
              error,
              context: {
                user: interaction.user.tag,
                guild: interaction.guildId
              }
            });

            await interaction.reply({
              embeds: [
                buildEmbed(
                  'An error occurred while trying to list all message filter exemptions',
                  'RED'
                )
              ]
            });
          }
        }
      },
      async 'set-logging-channel' (client: Client, interaction: CommandInteraction) {
        const channel = interaction.options.getChannel('channel', true);

        try {
          guilds.set(interaction.guildId, 'messageFilter.loggingChannel', channel.id);
        } catch (error) {
          logger.error({
            message: 'Could not set logging channel for message filters',
            error,
            context: {
              user: interaction.user.tag,
              guild: interaction.guildId
            }
          });

          await interaction.reply({
            embeds: [
              buildEmbed(
                'An error occurred while trying to set the logging channel',
                'RED'
              )
            ]
          });
        }

        logger.info(`Logs for message filters in ${interaction.guildId} will be sent to #${channel.name}`);

        await interaction.reply({
          embeds: [buildEmbed(`Logs for filtered messages will now be sent to ${channel}!`)],
          allowedMentions: { parse: [] }
        });
      }
    }
  ),
  additionalHandlers: {
    async messageCreate (client: Client, message: Message): Promise<void> {
      return filter(client, message);
    },
    async messageUpdate (client: Client, oldMessage: Message | PartialMessage, newMessage: Message | PartialMessage): Promise<void> {
      return filter(client, newMessage);
    }
  }
};
