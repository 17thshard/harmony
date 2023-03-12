export interface MessageFilter {
  match (content: string): Array<FilterResult>;

  describe (): string;

  toJSON (): SerializedFilter;
}

type SerializedFilter = { type: string, filter: string }

export interface Interval {
  low: number;
  high: number;
}

export class FilterResult {
  constructor (public readonly word: string, public readonly interval: Interval) {
  }
}

export class RegexFilter implements MessageFilter {
  private readonly regex: RegExp;

  constructor (regex: RegExp) {
    this.regex = new RegExp(regex, 'gi');
  }

  match (content: string): Array<FilterResult> {
    return [...content.matchAll(this.regex)].map(match => new FilterResult(
      match[0],
      { low: match.index, high: match.index + match[0].length }
    ));
  }

  describe (): string {
    return `Matches \`/${this.regex.source}/\``;
  }

  toJSON (): SerializedFilter {
    return {
      type: 'regex',
      filter: this.regex.source
    };
  }
}

export class ContainsFilter extends RegexFilter {
  constructor (private readonly search: string) {
    super(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  describe (): string {
    return `Contains \`${this.search}\``;
  }

  toJSON (): SerializedFilter {
    return {
      type: 'contains',
      filter: this.search
    };
  }
}

export class WordFilter extends RegexFilter {
  constructor (private readonly word: string) {
    super(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
  }

  describe (): string {
    return `Contains \`${this.word}\` surrounded by word boundaries`;
  }

  toJSON (): SerializedFilter {
    return {
      type: 'word',
      filter: this.word
    };
  }
}

export function deserialize (serialized: SerializedFilter): MessageFilter | null {
  switch (serialized.type) {
    case 'regex':
      return new RegexFilter(new RegExp(serialized.filter));
    case 'contains':
      return new ContainsFilter(serialized.filter);
    case 'word':
      return new WordFilter(serialized.filter);
  }

  return null;
}
