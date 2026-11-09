import { z } from "zod";

/** Database row id (uuid). */
export const idSchema = z.uuid();

/** Route params for `/:id` routes. */
export const idParamsSchema = z.strictObject({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

/** A project's public widget key: `pk_` + random. Identifies a project; grants nothing. */
export const publicKeySchema = z.string().regex(/^pk_[A-Za-z0-9_-]{8,64}$/, "Invalid public key");

/** ISO 8601 timestamp, as returned in JSON. */
export type Timestamp = string;
