import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";

@Injectable()
export class CustomStatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  listDefinitions(authorId: string) {
    return this.prisma.customStatistic.findMany({ where: { authorId }, orderBy: { updatedAt: "desc" } });
  }

  createDefinition(authorId: string, name: string, expression: string) {
    return this.prisma.customStatistic.create({ data: { authorId, name, expression } });
  }
}
