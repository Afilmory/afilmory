const enUiSchema = {
  settings: {
    title: 'System Settings',
    description: 'Manage the global behavior and service integrations for AFilmory.',
  },
  builder: {
    title: 'Builder Settings',
    description: 'Configure concurrency, logging, and repository sync rules for photo processing jobs.',
    sections: {
      processing: {
        title: 'Processing & Performance',
        description: 'Control concurrency, Live Photo behavior, and photo ID rules.',
        groups: {
          concurrency: {
            title: 'Concurrency Control',
            fields: {
              'default-concurrency': {
                title: 'Default concurrency',
                description: 'Maximum number of files processed in parallel per build run.',
                helper: 'Recommended: 1–2× the CPU core count.',
              },
              'worker-concurrency': {
                title: 'Worker internal concurrency',
                description: 'Maximum concurrent tasks inside each worker when cluster mode is enabled.',
              },
              'worker-count': {
                title: 'Max worker processes',
                description: 'Upper limit of worker processes when the builder runs in cluster mode.',
              },
              'worker-timeout': {
                title: 'Worker timeout (ms)',
                description: 'Time to wait before restarting an unresponsive worker process.',
              },
            },
          },
          behavior: {
            title: 'Processing Behavior',
            fields: {
              'enable-live-photo': {
                title: 'Enable Live Photo detection',
                description: 'Pair HEIC and MP4 assets to build Live Photo collections.',
                true: 'Enabled',
                false: 'Disabled',
              },
              'digest-suffix-length': {
                title: 'Digest suffix length',
                description: 'Append SHA-256 characters to photo IDs to avoid collisions. Set 0 to disable.',
              },
              'supported-formats': {
                title: 'Allowed image formats',
                description:
                  'Optional comma-separated extensions, for example: jpg,png,heic. Leave empty for no limit.',
              },
            },
          },
        },
      },
      observability: {
        title: 'Logging & Observability',
        description: 'Tune logging level, progress outputs, and cluster behavior.',
        groups: {
          progress: {
            title: 'Progress feedback',
            fields: {
              'show-progress': {
                title: 'Show terminal progress bar',
                description: 'Display live progress in the CLI.',
              },
              'show-detailed-stats': {
                title: 'Print detailed stats',
                description: 'Output elapsed time and delta statistics after a build finishes.',
              },
              'use-cluster-mode': {
                title: 'Enable cluster mode',
                description: 'Spawn multiple worker processes through Node.js Cluster on multi-core hosts.',
              },
            },
          },
          logging: {
            title: 'Logging levels',
            fields: {
              'logging-level': {
                title: 'Log level',
                description: 'Controls the verbosity of CLI output.',
                placeholder: 'Select a log level',
              },
              'logging-verbose': {
                title: 'Enable verbose mode',
                description: 'Output additional debugging logs.',
              },
              'logging-output': {
                title: 'Write log files',
                description: 'Persist build logs to disk for troubleshooting.',
              },
            },
          },
        },
      },
    },
  },
  site: {
    title: 'Site Settings',
    description: 'Configure branding, social links, and map experiences for the public site.',
    sections: {
      basic: {
        title: 'Basic information',
        description: 'Shown in the site navigation, home page title, and SEO metadata.',
        fields: {
          'site-name': {
            title: 'Site name',
            description: 'Appears in navigation and shared titles.',
            placeholder: 'Enter a site name',
          },
          'site-title': {
            title: 'Home page title',
            description: 'Used for the browser tab and SEO title.',
            placeholder: 'Enter a home title',
          },
          'site-description': {
            title: 'Site description',
            description: 'Used for site intro and search engine snippets.',
            placeholder: 'Describe your site…',
          },
          'site-url': {
            title: 'Site URL',
            description: 'Public base URL, must be an absolute URL.',
            placeholder: 'https://example.com',
          },
          'site-accent-color': {
            title: 'Accent color',
            description: 'Applied to buttons and highlights, supports HEX format.',
            helper: 'Example: #007bff',
          },
        },
      },
      social: {
        title: 'Social & subscriptions',
        description: 'Links displayed in the site footer and about section.',
        groups: {
          channels: {
            title: 'Social channels',
            description: 'Provide full URLs or usernames shown in the social block.',
            fields: {
              twitter: {
                title: 'Twitter',
                helper: 'Supports full URLs or @username.',
              },
              github: {
                title: 'GitHub',
                helper: 'Supports full URLs or usernames.',
              },
              rss: {
                title: 'Expose RSS feed',
                description: 'Enable to publish an RSS endpoint on the public site.',
                helper: 'Visitors can subscribe to the latest photos via RSS.',
              },
            },
          },
        },
      },
      feed: {
        title: 'Feed integrations',
        description: 'Configure external feed providers for aggregated content.',
        groups: {
          folo: {
            title: 'Folo Challenge',
            description: 'Feed ID and User ID required for syncing Folo Challenge data.',
            fields: {
              'feed-id': {
                title: 'Feed ID',
                placeholder: 'Enter feed ID',
              },
              'user-id': {
                title: 'User ID',
                placeholder: 'Enter user ID',
              },
            },
          },
        },
      },
      map: {
        title: 'Map display',
        description: 'Configure providers, style, and projection for the map component.',
        fields: {
          providers: {
            title: 'Map providers',
            description: 'JSON array ordered by priority, for example ["maplibre"].',
            helper: 'Leave empty to disable map features.',
          },
          style: {
            title: 'Map style',
            description: 'Provide a MapLibre Style URL or use "builtin" for presets.',
            helper: 'Example: builtin or https://tiles.example.com/style.json',
          },
          projection: {
            title: 'Map projection',
            description: 'Choose the rendering projection.',
            helper: 'Defaults to mercator; switch to globe if needed.',
            placeholder: 'Select a projection',
          },
        },
      },
    },
  },
  system: {
    title: 'Platform Settings',
    description: 'Manage registration flow, login strategy, and shared OAuth providers for the platform.',
    sections: {
      registration: {
        title: 'Global registration policy',
        description: 'Control new user quotas and local account capabilities.',
        fields: {
          'allow-registration': {
            title: 'Allow new registrations',
            description: 'When disabled, only super admins can add accounts manually.',
          },
          'local-provider': {
            title: 'Enable email/password login',
            description: 'When disabled, users must sign in through third-party providers.',
          },
          'base-domain': {
            title: 'Base domain',
            description:
              'Used to resolve tenant subdomains (e.g., example.yourdomain.com). Update DNS and TLS before changing.',
            helper: 'Leave empty to use the default domain afilmory.art.',
            placeholder: 'afilmory.art',
          },
          'max-users': {
            title: 'Maximum registrable users',
            description: 'Block new sign-ups when the limit is reached. Leave empty for unlimited.',
            helper: 'Set to 0 to immediately prevent new registrations.',
            placeholder: 'Unlimited',
          },
        },
      },
      billing: {
        title: 'Plan configuration',
        description: 'Define quotas, display pricing, and Creem products per plan.',
        fields: {
          quota: {
            helper: 'Leave empty to inherit defaults or no limit; numbers override plan settings.',
            'monthly-asset': {
              title: 'Monthly new photos',
              description: 'Stop new uploads once this monthly cap is reached. Empty means fallback or unlimited.',
              placeholder: 'e.g. 300',
            },
            'library-limit': {
              title: 'Library capacity',
              description: 'Maximum total photos a tenant can manage. 0 blocks new uploads completely.',
              placeholder: 'e.g. 500',
            },
            'upload-limit': {
              title: 'Upload size limit (MB)',
              description: 'Maximum size per upload from the dashboard. Empty falls back to default or unlimited.',
              placeholder: 'e.g. 20',
            },
            'sync-limit': {
              title: 'Sync object size limit (MB)',
              description: 'Maximum file size allowed during Data Sync imports.',
              placeholder: 'e.g. 50',
            },
          },
          pricing: {
            'monthly-price': {
              title: 'Monthly price',
              description: 'Displayed price or Creem product price override. Leave blank to keep defaults.',
              placeholder: 'e.g. 49',
              helper: 'Blank hides pricing information.',
            },
            currency: {
              title: 'Currency',
              description: 'ISO currency code, e.g., CNY or USD.',
              placeholder: 'CNY',
              helper: 'Blank falls back to the default currency or hides the symbol.',
            },
          },
          payment: {
            'creem-product': {
              title: 'Creem product ID',
              description: 'Creem product used to create checkout sessions. Leave blank to hide the upgrade entry.',
              placeholder: 'prod_xxx',
            },
            helper: 'Blank values hide the upgrade entry.',
          },
        },
        plans: {
          free: {
            title: 'Free Plan (free)',
            description: 'Default starter tier for individuals and trials.',
          },
          pro: {
            title: 'Pro Plan (pro)',
            description: 'Professional tier reserved for the upcoming subscription release.',
          },
          friend: {
            title: 'Friend Plan (friend)',
            description: 'Internal unlimited tier available only to super administrators.',
          },
        },
      },
      'storage-plans': {
        title: 'Storage plans',
        description: 'Managed storage catalog, pricing, and Creem products for storage subscriptions.',
        fields: {
          catalog: {
            title: 'Plan catalog',
            description:
              'Manage storage plans for managed B2 space. Use the dashboard editor; JSON is no longer required.',
            placeholder: 'Configured via dashboard',
            helper: 'Plans include name/description/capacity and active flag.',
          },
          pricing: {
            title: 'Storage pricing',
            description: 'Monthly price and currency per storage plan.',
            placeholder: 'Configured via dashboard',
            helper: 'Blank values fall back to defaults or hide pricing.',
          },
          products: {
            title: 'Creem products',
            description: 'Creem product per storage plan for checkout and portal.',
            placeholder: 'Configured via dashboard',
            helper: 'Blank values hide the upgrade entry for that plan.',
          },
          'managed-provider': {
            title: 'Managed provider key',
            description: 'Provider ID from storage providers list that backs managed storage plans (e.g., b2-managed).',
            placeholder: 'b2-managed',
            helper: 'Used by backend to issue upload/read credentials for managed tenants.',
          },
        },
      },
      oauth: {
        title: 'OAuth providers',
        description: 'Configure shared third-party login providers for all tenants.',
        fields: {
          gateway: {
            title: 'OAuth gateway URL',
            description:
              'Unified callback endpoint for third-party logins (e.g., https://auth.afilmory.art). Leave blank to fall back to tenant domains.',
            helper: 'Must include http/https; no trailing slash required.',
            placeholder: 'https://auth.afilmory.art',
          },
        },
        groups: {
          google: {
            title: 'Google OAuth',
            description: 'Create an OAuth app in Google Cloud Console and fill the credentials below.',
            fields: {
              'client-id': {
                title: 'Client ID',
                description: 'Google OAuth client ID.',
                placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com',
              },
              'client-secret': {
                title: 'Client Secret',
                description: 'Google OAuth client secret.',
                placeholder: '************',
              },
            },
          },
          github: {
            title: 'GitHub OAuth',
            description: 'Create an OAuth App under GitHub Developer settings and fill the credentials below.',
            fields: {
              'client-id': {
                title: 'Client ID',
                description: 'GitHub OAuth client ID.',
                placeholder: 'Iv1.xxxxxxxxxxxxxxxx',
              },
              'client-secret': {
                title: 'Client Secret',
                description: 'GitHub OAuth client secret.',
                placeholder: '****************',
              },
            },
          },
        },
      },
    },
  },
  storage: {
    providers: {
      types: {
        s3: 'AWS S3 Compatible Object Storage',
        github: 'GitHub repository',
        b2: 'Backblaze B2 cloud storage',
      },
      fields: {
        s3: {
          bucket: {
            label: 'Bucket name',
            description: 'Name of the S3 bucket that stores your photos.',
            placeholder: 'afilmory-photos',
          },
          region: {
            label: 'Region',
            description: 'S3 region code, e.g. ap-southeast-1.',
            placeholder: 'ap-southeast-1',
          },
          endpoint: {
            label: 'Custom endpoint',
            description: 'Optional endpoint for S3-compatible services.',
            placeholder: 'https://s3.example.com',
            helper: 'Leave empty for AWS S3. Required for MinIO or other vendors.',
          },
          'access-key': {
            label: 'Access Key ID',
            placeholder: 'AKIAxxxxxxxxxxxx',
          },
          'secret-key': {
            label: 'Secret Access Key',
            placeholder: '************',
          },
          prefix: {
            label: 'Path prefix',
            description: 'Optional. Limit scanning to objects under this prefix.',
            placeholder: 'photos/',
          },
          'custom-domain': {
            label: 'Custom public domain',
            description: 'Domain used when generating public photo URLs.',
            placeholder: 'https://cdn.example.com',
          },
          'exclude-regex': {
            label: 'Exclude pattern (regex)',
            description: 'Optional. Skip files that match this regular expression.',
            placeholder: '\\.(tmp|bak)$',
            helper: 'Use JavaScript-compatible regular expressions.',
          },
          'max-files': {
            label: 'Max files',
            description: 'Optional limit for how many files to scan per run.',
            placeholder: '1000',
          },
        },
        github: {
          owner: {
            label: 'Repository owner',
            description: 'GitHub user or organization name.',
            placeholder: 'afilmory',
          },
          repo: {
            label: 'Repository name',
            description: 'Repository that stores your photos.',
            placeholder: 'photo-assets',
          },
          branch: {
            label: 'Branch',
            description: 'Optional branch to sync.',
            placeholder: 'main',
            helper: 'Defaults to master/main. Provide the full branch name if it differs.',
          },
          token: {
            label: 'Access token',
            description: 'Personal Access Token for private repositories.',
            placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
          },
          path: {
            label: 'Repository path',
            description: 'Optional path within the repository to limit syncing.',
            placeholder: 'public/photos',
          },
          'use-raw': {
            label: 'Use raw URL',
            description: 'Use raw.githubusercontent.com when generating public URLs.',
            placeholder: 'true / false',
            helper: 'Set to false if you serve files via a custom domain.',
          },
        },
        b2: {
          'application-key-id': {
            label: 'Application Key ID',
            description: 'Backblaze B2 application key ID used for API authentication.',
            placeholder: '003xxxxxxxxxxxxxxxx000000000',
          },
          'application-key': {
            label: 'Application Key',
            description: 'Secret application key paired with the ID above.',
            placeholder: 'K0000000000000000000000000000000',
          },
          'bucket-id': {
            label: 'Bucket ID',
            description: 'Unique ID of the bucket used for photo storage.',
            placeholder: '4a48fe8875c6214145260818',
          },
          'bucket-name': {
            label: 'Bucket name',
            description: 'Friendly bucket name for reference or public URL generation.',
            placeholder: 'afilmory-photos',
          },
          prefix: {
            label: 'Path prefix',
            description: 'Optional. Restrict scanning to files under this prefix.',
            placeholder: 'photos/',
          },
          'custom-domain': {
            label: 'Custom public domain',
            description: 'Domain used when generating public URLs (e.g., CDN).',
            placeholder: 'https://cdn.example.com',
          },
          'exclude-regex': {
            label: 'Exclude pattern (regex)',
            description: 'Optional regular expression to skip matching files.',
            placeholder: '\\.(tmp|bak)$',
            helper: 'Use JavaScript-compatible regular expressions.',
          },
          'max-files': {
            label: 'Max files',
            description: 'Optional limit for how many files to scan per run.',
            placeholder: '1000',
          },
          'authorization-ttl': {
            label: 'Authorization TTL (ms)',
            description: 'Override cache duration for B2 authorization tokens.',
            placeholder: '3600000',
          },
          'upload-ttl': {
            label: 'Upload URL TTL (ms)',
            description: 'Override cache duration for B2 upload URLs.',
            placeholder: '900000',
          },
        },
      },
    },
  },
} as const

export default enUiSchema
