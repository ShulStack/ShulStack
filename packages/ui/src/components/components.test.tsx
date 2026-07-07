import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";
import { EmptyState } from "./empty-state";
import { Field } from "./field";
import { Stat } from "./stat";

describe("Button", () => {
  test("defaults to type=button so forms are not accidentally submitted", () => {
    render(<Button>Click</Button>);
    expect(screen.getByRole("button", { name: "Click" })).toHaveProperty("type", "button");
  });

  test("applies the variant class", () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole("button", { name: "Delete" }).className).toContain("danger");
  });
});

describe("Field", () => {
  test("associates the label with the control", () => {
    render(<Field label="Email">{(id) => <input id={id} type="email" />}</Field>);
    const input = screen.getByLabelText("Email");
    expect(input).toBeDefined();
    expect(input.tagName).toBe("INPUT");
  });
});

describe("Card", () => {
  test("renders a titled section", () => {
    render(
      <Card title="Households">
        <p>Body</p>
      </Card>,
    );
    expect(screen.getByRole("heading", { name: "Households" })).toBeDefined();
    expect(screen.getByText("Body")).toBeDefined();
  });
});

describe("EmptyState", () => {
  test("renders title, description, and action", () => {
    render(
      <EmptyState
        title="No people yet"
        description="Add your first"
        action={<Button>Add</Button>}
      />,
    );
    expect(screen.getByRole("heading", { name: "No people yet" })).toBeDefined();
    expect(screen.getByText("Add your first")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
  });
});

describe("Badge and Stat", () => {
  test("badge carries its tone class", () => {
    render(<Badge tone="positive">Active</Badge>);
    expect(screen.getByText("Active").className).toContain("badge-positive");
  });

  test("stat renders label and value", () => {
    render(<Stat label="Active households" value={42} />);
    expect(screen.getByText("Active households")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
  });
});
