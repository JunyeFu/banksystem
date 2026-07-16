package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import liquibase.changelog.ChangeLogParameters;
import liquibase.parser.core.yaml.YamlChangeLogParser;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;

class TransferReceiptSchemaContractTest {

  @Test
  void masterChangelogParsesWithReceiptRepairIncluded() throws Exception {
    try (ClassLoaderResourceAccessor resources = new ClassLoaderResourceAccessor()) {
      var changeLog = new YamlChangeLogParser().parse(
          "db/changelog/db.changelog-master.yaml", new ChangeLogParameters(), resources);
      assertTrue(changeLog.getChangeSets().stream().anyMatch(changeSet ->
          "v8-transfer-receipt-reference-type".equals(changeSet.getId())
              && "codex".equals(changeSet.getAuthor())));
    }
  }

  @Test
  void repairMigrationConvertsAndConstrainsExistingColumn() throws Exception {
    String migration;
    try (InputStream input = resource("db/changelog/v8-transfer-receipt-reference.yaml")) {
      migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }

    assertTrue(migration.contains("ALTER COLUMN transfer_id TYPE uuid"));
    assertTrue(migration.contains("uq_transfer_receipt_transfer_id"));
    assertTrue(migration.contains("fk_transfer_receipt_transfer_order"));
    assertTrue(migration.contains("onDelete: CASCADE"));
  }

  private InputStream resource(String path) {
    InputStream input = getClass().getClassLoader().getResourceAsStream(path);
    if (input == null) throw new IllegalArgumentException("Missing test resource: " + path);
    return input;
  }

}
