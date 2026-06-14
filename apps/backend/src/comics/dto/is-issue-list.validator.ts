import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { parseCollects } from '../comic-issue-list';

/** Validates that a string is a parseable issue-list (no unrecognized tokens). */
export function IsIssueList(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIssueList',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null || value === undefined) return true;
          if (typeof value !== 'string') return false;
          return parseCollects(value).unrecognized.length === 0;
        },
        defaultMessage(args: ValidationArguments) {
          if (typeof args.value !== 'string') return 'collects must be a string';
          const { unrecognized } = parseCollects(args.value);
          return `collects has unrecognized issue tokens: ${unrecognized.join(', ')}`;
        },
      },
    });
  };
}
