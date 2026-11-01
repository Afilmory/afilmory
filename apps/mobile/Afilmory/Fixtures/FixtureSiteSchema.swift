#if DEBUG
  import Foundation

  enum FixtureSiteSchema {
    static let defaultValues: [String: String] = [
      "site.viewer.regions.labelPlacement": "edge",
      "site.map.providers": #"["maplibre"]"#,
      "site.mapStyle": "builtin",
      "site.mapProjection": "globe",
    ]

    static var schema: [String: Any] {
      [
        "version": "1.1.0",
        "title": "Site settings",
        "description": "Configure how your public gallery looks to visitors.",
        "sections": [
          section("site-basic", "Basic information", "Name, title and look of your gallery.", [
            field("site-name", "Site name", key: "site.name", component: ["type": "text", "placeholder": "My Afilmory"], required: true),
            field("site-title", "Site title", key: "site.title", component: ["type": "text", "placeholder": "Photos"], required: true),
            field(
              "site-description", "Description", key: "site.description",
              component: ["type": "textarea", "placeholder": "A short introduction", "minRows": 3, "maxRows": 6], required: true
            ),
            field(
              "site-url", "Site URL", key: "site.url",
              component: ["type": "text", "inputType": "url", "placeholder": "https://example.com"], required: true
            ),
            field(
              "site-accent-color", "Accent colour", key: "site.accentColor",
              component: ["type": "color", "supportsOpacity": false], required: true,
              helper: "Used for links and highlights on the web gallery."
            ),
          ]),
          section("site-social", "Social links", "Shown in the gallery footer.", [
            [
              "type": "group",
              "id": "site-social-group",
              "title": "Channels",
              "description": "Links to your profiles.",
              "children": [
                field(
                  "site-social-twitter", "X (Twitter)", key: "site.social.twitter",
                  component: ["type": "text", "autoCapitalize": "none", "autoCorrect": false, "placeholder": "https://twitter.com/username"]
                ),
                field(
                  "site-social-github", "GitHub", key: "site.social.github",
                  component: ["type": "text", "autoCapitalize": "none", "autoCorrect": false, "placeholder": "https://github.com/username"]
                ),
              ],
            ],
          ]),
          section("site-viewer", "Viewer", "How photos are presented.", [
            field(
              "site-viewer-region-label-placement", "Region label placement", key: "site.viewer.regions.labelPlacement",
              component: ["type": "select", "options": ["edge", "floating"], "presentation": "segmented"]
            ),
          ]),
          section("site-map", "Map", "The map of where your photos were taken.", [
            field(
              "site-map-providers", "Map providers", key: "site.map.providers",
              component: ["type": "multiSelect", "options": ["maplibre"]], helper: "Choose at least one provider."
            ),
            field(
              "site-map-style", "Map style", key: "site.mapStyle",
              component: ["type": "text", "autoCapitalize": "none", "autoCorrect": false, "placeholder": "builtin"]
            ),
            field(
              "site-map-projection", "Projection", key: "site.mapProjection",
              component: ["type": "select", "options": ["mercator", "globe"], "presentation": "segmented"]
            ),
          ]),
        ],
      ]
    }

    private static func section(_ id: String, _ title: String, _ description: String, _ children: [[String: Any]]) -> [String: Any] {
      ["type": "section", "id": id, "title": title, "description": description, "children": children]
    }

    private static func field(
      _ id: String,
      _ title: String,
      key: String,
      component: [String: Any],
      required: Bool = false,
      helper: String? = nil
    ) -> [String: Any] {
      var node: [String: Any] = ["type": "field", "id": id, "title": title, "key": key, "component": component]
      if required { node["required"] = true }
      if let helper { node["helperText"] = helper }
      return node
    }
  }
#endif
