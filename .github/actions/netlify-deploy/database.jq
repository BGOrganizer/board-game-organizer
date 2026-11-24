.databaseName as $db
| ($db | type == "string" and length > 0 and (startswith("bgo_ci_") | not))
  and ((.webhookDatabaseName // $db) == $db)
