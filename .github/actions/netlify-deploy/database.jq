.databaseName as $db
| if $expected == "" then
    ($db | type == "string" and length > 0 and (startswith("bgo_ci_") | not))
    and ((.webhookDatabaseName // $db) == $db)
  else
    $db == $expected and
    ((.webhookDatabaseName // "") | startswith("bgo_ci_") | not)
  end
