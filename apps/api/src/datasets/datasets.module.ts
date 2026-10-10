import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { DatasetReleasesController } from "./datasets.controller.js";
import { DatasetReleasesService } from "./datasets.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [DatasetReleasesController],
  providers: [DatasetReleasesService],
})
export class DatasetsModule {}
