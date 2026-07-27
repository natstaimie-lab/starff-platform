import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import {
  ENCRYPTED_FIELDS,
  encryptWriteArgs,
  decryptResult,
} from './field-crypto';

/**
 * One shared database connection for the whole API.
 * Inject `PrismaService` into any service to read/write the database.
 *
 * A middleware transparently encrypts/decrypts the sensitive fields listed in
 * ENCRYPTED_FIELDS (bank details, NI) so plaintext never reaches the database.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    this.$use(async (params, next) => {
      const fields = params.model ? ENCRYPTED_FIELDS[params.model] : undefined;
      if (fields) encryptWriteArgs(params.args, fields);
      const result = await next(params);
      if (fields) decryptResult(result, fields);
      return result;
    });
    await this.$connect();
  }
}
