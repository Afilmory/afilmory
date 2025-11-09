#! /bin/bash

cp -r photos ./apps/web/public/photos

echo 'import { defineBuilderConfig } from "@afilmory/builder";

export default defineBuilderConfig(() => ({
  storage: {
    provider: "local",
    basePath: "./apps/web/public/photos",
    baseUrl: "/photos",
  },
}))' >builder.config.ts
