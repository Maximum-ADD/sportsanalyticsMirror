import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("shows the current page, total pages, and total count", () => {
    render(<Pagination page={2} pageSize={10} total={45} onPageChange={vi.fn()} />);
    expect(screen.getByText("Page 2 of 5 (45 total)")).toBeInTheDocument();
  });

  it("treats a zero total as a single page rather than dividing by zero", () => {
    render(<Pagination page={1} pageSize={10} total={0} onPageChange={vi.fn()} />);
    expect(screen.getByText("Page 1 of 1 (0 total)")).toBeInTheDocument();
  });

  it("disables Previous on the first page", () => {
    render(<Pagination page={1} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("disables Next on the last page", () => {
    render(<Pagination page={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("calls onPageChange(page - 1) when Previous is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageSize={10} total={30} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("calls onPageChange(page + 1) when Next is clicked", async () => {
    const onPageChange = vi.fn();
    const user = userEvent.setup();
    render(<Pagination page={2} pageSize={10} total={30} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  describe("locker tone", () => {
    it("summarizes the visible range and total", () => {
      render(<Pagination tone="locker" page={2} pageSize={10} total={476} onPageChange={vi.fn()} />);

      expect(screen.getByText("Showing 11–20 of 476")).toBeInTheDocument();
    });

    it("compresses the page list with an ellipsis", () => {
      render(<Pagination tone="locker" page={1} pageSize={10} total={476} onPageChange={vi.fn()} />);

      expect(screen.getByRole("button", { name: "1" })).toHaveAttribute("aria-current", "page");
      expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "48" })).toBeInTheDocument();
      expect(screen.getByText("…")).toBeInTheDocument();
    });

    it("jumps straight to a page number when one is clicked", async () => {
      const onPageChange = vi.fn();
      const user = userEvent.setup();
      render(<Pagination tone="locker" page={1} pageSize={10} total={476} onPageChange={onPageChange} />);

      await user.click(screen.getByRole("button", { name: "48" }));

      expect(onPageChange).toHaveBeenCalledWith(48);
    });

    it("disables Prev on the first page and Next on the last", () => {
      const { rerender } = render(
        <Pagination tone="locker" page={1} pageSize={10} total={30} onPageChange={vi.fn()} />
      );
      expect(screen.getByRole("button", { name: "Prev" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

      rerender(<Pagination tone="locker" page={3} pageSize={10} total={30} onPageChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Prev" })).toBeEnabled();
      expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    });
  });
});
