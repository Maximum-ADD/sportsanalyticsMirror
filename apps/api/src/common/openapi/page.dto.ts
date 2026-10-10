import type { Type } from "@nestjs/common";
import { ApiProperty } from "@nestjs/swagger";
import type { PagedResult } from "../pagination.js";

/**
 * Builds the OpenAPI model for one page of a paginated list, the
 * { data, page, pageSize, total } envelope every list endpoint returns (see
 * pagination.ts).
 *
 * OpenAPI has no generics, so each item type needs its own named page
 * model; this keeps them identical apart from the item.
 *
 * @param itemDto - the model of one row in `data`.
 * @param pageDtoName - the component name the page model is published under,
 *   e.g. "PlayerPageDto".
 * @returns a class Swagger documents as that page model.
 */
export function createPageDto<Item>(itemDto: Type<Item>, pageDtoName: string): Type<PagedResult<Item>> {
  class PageDto implements PagedResult<Item> {
    @ApiProperty({ type: [itemDto], description: "This page's rows" })
    data!: Item[];

    @ApiProperty({ example: 1, description: "1-based page number" })
    page!: number;

    @ApiProperty({ example: 25, description: "Rows per page (default 25, max 100)" })
    pageSize!: number;

    @ApiProperty({ example: 530, description: "Rows across every page" })
    total!: number;
  }
  Object.defineProperty(PageDto, "name", { value: pageDtoName });
  return PageDto;
}
