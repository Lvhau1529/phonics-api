import { type Prisma } from '../generated/prisma/client';

/** Client trong transaction (`$transaction(async (tx) => …)`) hoặc PrismaService thường */
export type Tx = Prisma.TransactionClient;
