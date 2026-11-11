import { render, screen } from "@testing-library/react";
import App from "./App";

test("signed-out visitors see the MetroNotify login screen and the three supported portals", () => {
  render(<App />);

  expect(screen.getByText("MetroNotify")).toBeInTheDocument();
  expect(screen.getByText("Ratepayer Portal")).toBeInTheDocument();
  expect(screen.getByText("Technician Portal")).toBeInTheDocument();
  expect(screen.getByText("Municipal Admin Portal")).toBeInTheDocument();
  expect(screen.queryByText(/Guest Portal/i)).not.toBeInTheDocument();
});
