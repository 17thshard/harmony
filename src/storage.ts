import { KeyvFile } from 'keyv-file';
import { Snowflake } from 'discord.js';

const backingFile = new KeyvFile({ filename: 'data-store.json' });
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

class GuildStorage {
  private cache: { [key: string]: { expiry: number, value: any } } = {};

  private buildStorageKey (guild: Snowflake, key: string): string {
    return `guilds.${guild}.${key}`;
  }

  channels (guild: Snowflake): ChannelStorage {
    return this.get(guild, 'channels', channels => new ChannelStorage(guild, this, channels), new ChannelStorage(guild, this, {}));
  }

  set<V> (guild: Snowflake, key: string, value: V) {
    const storageKey = this.buildStorageKey(guild, key);
    backingFile.set(storageKey, JSON.parse(JSON.stringify(value)));
    this.cache[storageKey] = { expiry: Date.now() + CACHE_TTL, value: value };
  }

  get<V> (guild: Snowflake, key: string, deserialize: (raw: any) => V = v => v, defaultValue: V | null = null): V | null {
    const storageKey = this.buildStorageKey(guild, key);
    if (this.cache[storageKey] !== undefined && this.cache[storageKey].expiry >= Date.now()) {
      return this.cache[storageKey].value;
    }

    const raw = backingFile.get(storageKey);
    if (raw === undefined) {
      return defaultValue;
    }

    const deserialized = deserialize(raw);
    this.cache[storageKey] = { expiry: Date.now() + CACHE_TTL, value: deserialized };
    return deserialized;
  }

  delete (guild: Snowflake, key: string) {
    const storageKey = this.buildStorageKey(guild, key);
    backingFile.delete(storageKey);
    delete this.cache[storageKey];
  }

  view<V> (key: string, deserialize: (raw: any) => V = v => v): GuildView<V> {
    return new GuildView<V>(this, key, deserialize);
  }
}

class GuildView<V> {
  constructor (private readonly backing: GuildStorage, private readonly key: string, private readonly deserialize: (raw: any) => V) {
  }

  set (guild: Snowflake, value: V) {
    this.backing.set(guild, this.key, value);
  }

  get (guild: Snowflake, defaultValue: V | null = null): V | null {
    return this.backing.get(guild, this.key, this.deserialize, defaultValue);
  }
}

class ChannelStorage {
  private cache: { [key: string]: { expiry: number, value: any } } = {};

  constructor (
    private readonly guild: Snowflake,
    private readonly guildStorage: GuildStorage,
    private channels: { [channel: string]: { [key: string]: any } }
  ) {
  }

  set<V> (channel: Snowflake, key: string, value: V) {
    if (this.channels[channel] === undefined) {
      this.channels[channel] = {};
    }

    this.channels[channel][key] = value;
    this.cache[`${channel}.${key}`] = { expiry: Date.now() + CACHE_TTL, value: value };

    this.guildStorage.set(this.guild, 'channels', this.channels);
  }

  get<V> (channel: Snowflake, key: string, deserialize: (raw: any) => V = v => v, defaultValue: V | null = null): V | null {
    const cacheKey = `${channel}.${key}`;
    if (this.cache[cacheKey] !== undefined && this.cache[cacheKey].expiry >= Date.now()) {
      return this.cache[cacheKey].value;
    }

    if (this.channels[channel] === undefined) {
      return defaultValue;
    }

    const raw = this.channels[channel][key];
    if (raw === undefined) {
      return defaultValue;
    }

    return deserialize(raw);
  }

  delete (channel: Snowflake, key: string) {
    if (this.channels[channel] === undefined) {
      return;
    }

    delete this.channels[channel][key];
    delete this.cache[`${channel}.${key}`];

    this.guildStorage.set(this.guild, 'channels', this.channels);
  }

  list<V> (key: string, deserialize: (raw: any) => V = v => v): { [channel: Snowflake]: V } {
    return Object.keys(this.channels).map(channel => ({ channel, value: this.get(channel, key, deserialize) }))
      .reduce(
        (acc, { channel, value }) => {
          if (value !== null) {
            acc[channel] = value;
          }

          return acc;
        },
        {} as { [channel: Snowflake]: V }
      );
  }

  toJSON () {
    return this.channels;
  }
}

export const guilds = new GuildStorage();
