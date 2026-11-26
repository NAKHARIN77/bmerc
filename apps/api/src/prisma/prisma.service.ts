import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  }

  /**
   * Company data is kept apart by row-level security. A login that bypasses it (a superuser, or a role with
   * BYPASSRLS such as Supabase's "postgres") would let every company see every other company's data,
   * so the API refuses to start with one. Use the bmerc_app login (deploy/start.sh sets it up).
   */
  async onModuleInit() {
    const [me] = await this.$queryRaw<Array<{ name: string; bypass: boolean }>>`
      SELECT current_user AS name, (rolsuper OR rolbypassrls) AS bypass FROM pg_roles WHERE rolname = current_user`;
    if (me?.bypass) {
      const msg = `DATABASE_URL logs in as "${me.name}", which bypasses row-level security: companies would see each other's data. Use the bmerc_app login (remove DATABASE_URL and set APP_DB_PASSWORD so deploy/start.sh creates it).`;
      new Logger('Database').error(msg);
      throw new Error(msg);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
