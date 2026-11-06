package local.bank.channel;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import liquibase.ChecksumVersion;
import liquibase.changelog.ChangeLogParameters;
import liquibase.parser.core.yaml.YamlChangeLogParser;
import liquibase.resource.ClassLoaderResourceAccessor;
import org.junit.jupiter.api.Test;
import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

class TransferReceiptSchemaContractTest {

  @Test
  void masterAndIncludedMigrationsRejectDuplicateYamlKeys() throws Exception {
    var options = new LoaderOptions();
    options.setAllowDuplicateKeys(false);
    var yaml = new Yaml(new SafeConstructor(options));
    Map<?, ?> master;
    try (InputStream input = resource("db/changelog/db.changelog-master.yaml")) {
      master = yaml.load(input);
    }
    for (Object entry : (List<?>) master.get("databaseChangeLog")) {
      var include = (Map<?, ?>) ((Map<?, ?>) entry).get("include");
      String path = (String) include.get("file");
      try (InputStream input = resource(path)) {
        assertDoesNotThrow(() -> { yaml.load(input); }, path);
      }
    }
  }

  @Test
  void initialReceiptRetainsItsPreviouslyEffectiveMigrationChecksum() throws Exception {
    try (ClassLoaderResourceAccessor resources = new ClassLoaderResourceAccessor()) {
      var changeLog = new YamlChangeLogParser().parse(
          "db/changelog/v1-initial-schema.yaml", new ChangeLogParameters(), resources);
      var receipt = changeLog.getChangeSets().stream()
          .filter(changeSet -> "v1-transfer-receipt".equals(changeSet.getId()))
          .findFirst().orElseThrow();
      // Captured before deduplication: char(64)/not-null; V8 performs the UUID/FK repair.
      assertEquals("9:27e26966dc713618283f1f333221987d",
          receipt.generateCheckSum(ChecksumVersion.V9).toString());
    }
  }

  @Test
  void masterChangelogParsesWithReceiptRepairIncluded() throws Exception {
    try (ClassLoaderResourceAccessor resources = new ClassLoaderResourceAccessor()) {
      var changeLog = new YamlChangeLogParser().parse(
          "db/changelog/db.changelog-master.yaml", new ChangeLogParameters(), resources);
    assertTrue(changeLog.getChangeSets().stream().anyMatch(changeSet ->
          "v8-transfer-receipt-reference-type".equals(changeSet.getId())
              && "codex".equals(changeSet.getAuthor())));
      assertTrue(changeLog.getChangeSets().stream().anyMatch(changeSet ->
          "v10-transfer-receipt-subject".equals(changeSet.getId())
              && "RF-031".equals(changeSet.getAuthor())));
    }
  }

  @Test
  void receiptEvidenceMigrationProvidesEveryProcessorColumn() throws Exception {
    String migration;
    try (InputStream input = resource("db/changelog/v10-transfer-receipt-evidence-columns.yaml")) {
      migration = new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }

    assertTrue(migration.contains("name: subject"));
    assertTrue(migration.contains("name: payload"));
    assertTrue(migration.contains("name: sha256"));
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
