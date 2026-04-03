import { api } from "./client";

export interface CreateTicketInput {
  type: "bug" | "feature";
  subject: string;
  body: string;
}

export const supportApi = {
  createTicket: (input: CreateTicketInput) =>
    api.post<{ id: string }>("/support/tickets", input),
};
