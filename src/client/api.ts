import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext } from "react";
import type { Ledger } from "../shared/calc";
import type { AppData, Person } from "../shared/types";
import { useToast } from "./ui";

export class ApiError extends Error {}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch("/api" + path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(json.error ?? `Request failed (${res.status})`);
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T = unknown>(path: string, body: unknown) => request<T>("POST", path, body),
  put: <T = unknown>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T = unknown>(path: string, body: unknown) => request<T>("PATCH", path, body),
  del: <T = unknown>(path: string) => request<T>("DELETE", path),
};

export const useDataQuery = () => useQuery({ queryKey: ["data"], queryFn: () => api.get<AppData>("/data") });

/**
 * Runs a write, refreshes the data and shows a toast.
 * Returns true on success so forms can close; errors are shown as a toast and returned as the message.
 */
export function useMutate() {
  const qc = useQueryClient();
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<true | string> => {
      try {
        await fn();
        await qc.invalidateQueries({ queryKey: ["data"] });
        if (success) toast(success);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        toast(msg);
        return msg;
      }
    },
    [qc, toast],
  );
}

export interface AppCtx {
  data: AppData;
  ledger: Ledger;
  today: string;
  person: (id: string) => Person | undefined;
}

export const AppContext = createContext<AppCtx | null>(null);
export function useApp(): AppCtx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}
