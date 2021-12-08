import { Message, PartialMessage, Snowflake } from 'discord.js';

export interface MessageFilterExemption {
  test (message: Message | PartialMessage): boolean;

  describe (): string;

  toJSON (): SerializedExemption;
}

type SerializedExemption = { type: string, target: string }

export class UserExemption implements MessageFilterExemption {
  constructor (private readonly target: Snowflake) {
  }

  test (message: Message | PartialMessage): boolean {
    return message.author.id == this.target;
  }

  describe (): string {
    return `User <@${this.target}>`;
  }

  toJSON (): SerializedExemption {
    return { type: 'user', target: this.target };
  }
}

export class RoleExemption implements MessageFilterExemption {
  constructor (private readonly target: Snowflake) {
  }

  test (message: Message | PartialMessage): boolean {
    return message.member.roles.resolveId(this.target) !== null;
  }

  describe (): string {
    return `Role <@&${this.target}>`;
  }

  toJSON (): SerializedExemption {
    return { type: 'role', target: this.target };
  }
}

export class ChannelExemption implements MessageFilterExemption {
  constructor (private readonly target: Snowflake) {
  }

  test (message: Message | PartialMessage): boolean {
    return message.channelId == this.target;
  }

  describe (): string {
    return `Channel <#${this.target}>`;
  }

  toJSON (): SerializedExemption {
    return { type: 'channel', target: this.target };
  }
}

export function deserialize (serialized: SerializedExemption): MessageFilterExemption | null {
  switch (serialized.type) {
    case 'user':
      return new UserExemption(serialized.target);
    case 'role':
      return new RoleExemption(serialized.target);
    case 'channel':
      return new ChannelExemption(serialized.target);
  }

  return null;
}
