import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { AuthService } from '../auth/auth.service';
import { RestaurantService } from './restaurant.service';

@SkipThrottle({ global: true, auth: true, chat: true })
@Controller('restaurant')
@UseGuards(AuthGuard)
export class RestaurantController {
  constructor(
    private readonly svc: RestaurantService,
    private readonly auth: AuthService,
  ) {}

  private pid(req: any, pageId: string): number {
    const n = Number(pageId);
    this.auth.ensurePageAccess(req.user || req.authUser, n);
    return n;
  }

  // ── Ingredients ─────────────────────────────────────────────────────────────
  @Get(':pageId/ingredients')
  listIngredients(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listIngredients(this.pid(r, p));
  }

  @Post(':pageId/ingredients')
  createIngredient(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.createIngredient(this.pid(r, p), b || {});
  }

  @Patch(':pageId/ingredients/:id')
  updateIngredient(
    @Param('pageId') p: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.updateIngredient(this.pid(r, p), id, b || {});
  }

  @Patch(':pageId/ingredients/:id/stock')
  adjustIngredientStock(
    @Param('pageId') p: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.adjustIngredientStock(this.pid(r, p), id, Number(b?.delta));
  }

  @Delete(':pageId/ingredients/:id')
  deleteIngredient(
    @Param('pageId') p: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() r: any,
  ) {
    return this.svc.deleteIngredient(this.pid(r, p), id);
  }

  // ── Recipes ─────────────────────────────────────────────────────────────────
  @Get(':pageId/products/:code/recipe')
  getRecipe(
    @Param('pageId') p: string,
    @Param('code') code: string,
    @Req() r: any,
  ) {
    return this.svc.getRecipe(this.pid(r, p), code);
  }

  @Put(':pageId/products/:code/recipe')
  setRecipe(
    @Param('pageId') p: string,
    @Param('code') code: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.setRecipe(this.pid(r, p), code, b?.rows ?? []);
  }

  // ── Per-order packaging ─────────────────────────────────────────────────────
  @Get(':pageId/packaging')
  getPackaging(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getPackaging(this.pid(r, p));
  }

  @Put(':pageId/packaging')
  setPackaging(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.setPackaging(this.pid(r, p), b?.rows ?? []);
  }

  // ── Menu photo AI import ────────────────────────────────────────────────────
  @Post(':pageId/menu-scan')
  scanMenu(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.scanMenu(this.pid(r, p), b?.imageUrls ?? []);
  }

  // ── Menu photos shown/sent to customers ─────────────────────────────────────
  @Get(':pageId/menu-images')
  getMenuImages(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getMenuImages(this.pid(r, p));
  }

  @Put(':pageId/menu-images')
  setMenuImages(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.setMenuImages(this.pid(r, p), b?.urls ?? []);
  }

  // ── Business hours ───────────────────────────────────────────────────────────
  @Get(':pageId/hours')
  getHours(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getHours(this.pid(r, p));
  }

  @Put(':pageId/hours')
  setHours(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.setHours(this.pid(r, p), b?.rows ?? []);
  }

  @Get(':pageId/happy-hour')
  getHappyHourWindow(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getHappyHourWindow(this.pid(r, p));
  }

  @Put(':pageId/happy-hour')
  setHappyHourWindow(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.setHappyHourWindow(this.pid(r, p), b?.rows ?? []);
  }

  // ── Combo offers ────────────────────────────────────────────────────────────
  @Get(':pageId/combos')
  listCombos(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listCombos(this.pid(r, p));
  }

  @Post(':pageId/combos')
  createCombo(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.createCombo(this.pid(r, p), b || {});
  }

  @Patch(':pageId/combos/:code')
  updateCombo(
    @Param('pageId') p: string,
    @Param('code') code: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.updateCombo(this.pid(r, p), code, b || {});
  }

  @Delete(':pageId/combos/:code')
  deleteCombo(@Param('pageId') p: string, @Param('code') code: string, @Req() r: any) {
    return this.svc.deleteCombo(this.pid(r, p), code);
  }

  // ── Milestone Rewards ───────────────────────────────────────────────────────
  @Get(':pageId/milestones')
  listMilestones(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listMilestones(this.pid(r, p));
  }

  @Post(':pageId/milestones')
  createMilestone(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.createMilestone(this.pid(r, p), b || {});
  }

  @Patch(':pageId/milestones/:id')
  updateMilestone(
    @Param('pageId') p: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.updateMilestone(this.pid(r, p), id, b || {});
  }

  @Delete(':pageId/milestones/:id')
  deleteMilestone(@Param('pageId') p: string, @Param('id', ParseIntPipe) id: number, @Req() r: any) {
    return this.svc.deleteMilestone(this.pid(r, p), id);
  }

  @Post(':pageId/products/bulk')
  bulkCreate(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.bulkCreateProducts(this.pid(r, p), b?.dishes ?? []);
  }

  // ── Food product edit + categories ──────────────────────────────────────────
  @Patch(':pageId/products/:code/food')
  updateFood(
    @Param('pageId') p: string,
    @Param('code') code: string,
    @Body() b: any,
    @Req() r: any,
  ) {
    return this.svc.updateFoodProduct(this.pid(r, p), code, b || {});
  }

  @Get(':pageId/categories')
  listCategories(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.listCategories(this.pid(r, p));
  }

  @Get(':pageId/menu-layout')
  getMenuLayout(@Param('pageId') p: string, @Req() r: any) {
    return this.svc.getMenuLayout(this.pid(r, p));
  }

  @Put(':pageId/menu-layout')
  setMenuLayout(@Param('pageId') p: string, @Body() b: any, @Req() r: any) {
    return this.svc.setMenuLayout(this.pid(r, p), b || {});
  }
}
