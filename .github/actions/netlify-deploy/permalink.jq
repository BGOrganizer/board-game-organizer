select(
  .id == $id and .site_id == $site and .name == $name and .state == "ready" and
  .context == $context and
  ($context != "branch-deploy" or
    (.branch == $alias and .deploy_ssl_url == "https://\($alias)--\($name).netlify.app"))
)
| "https://\($id)--\($name).netlify.app"
