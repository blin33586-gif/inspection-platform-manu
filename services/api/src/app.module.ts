import { Module } from "@nestjs/common";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { CommunitiesModule } from "./modules/communities/communities.module.js";
import { RoadsModule } from "./modules/roads/roads.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { IssuesModule } from "./modules/issues/issues.module.js";
import { MapAssetsModule } from "./modules/map-assets/map-assets.module.js";
import { PointsModule } from "./modules/points/points.module.js";

@Module({
  imports: [
    DashboardModule,
    CommunitiesModule,
    RoadsModule,
    PointsModule,
    ReportsModule,
    IssuesModule,
    MapAssetsModule,
  ],
})
export class AppModule {}
