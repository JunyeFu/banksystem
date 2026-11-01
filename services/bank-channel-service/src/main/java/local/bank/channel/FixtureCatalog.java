package local.bank.channel;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Profile("test-support")
@Component
public class FixtureCatalog {
  private final Map<String, Map<String, Object>> fixtures;

  @SuppressWarnings("unchecked")
  public FixtureCatalog(@Value("${bank.fixtures.path}") String catalogPath) {
    try (var input = Files.newInputStream(Path.of(catalogPath))) {
      Map<String, Object> root = new ObjectMapper(new YAMLFactory()).readValue(input, Map.class);
      Object definitions = root.get("fixtures");
      if (!(definitions instanceof Map<?, ?> entries)) throw new IllegalStateException("Fixture catalog is missing fixtures");
      Map<String, Map<String, Object>> parsed = new LinkedHashMap<>();
      for (var entry : entries.entrySet()) {
        if (!(entry.getValue() instanceof Map<?, ?> values)) throw new IllegalStateException("Invalid fixture: " + entry.getKey());
        parsed.put(String.valueOf(entry.getKey()), (Map<String, Object>) values);
      }
      fixtures = Map.copyOf(parsed);
    } catch (IOException error) {
      throw new IllegalStateException("Fixture catalog unavailable: " + catalogPath, error);
    }
  }

  public Map<String, Object> require(String logicalRef) {
    Map<String, Object> fixture = fixtures.get(logicalRef);
    if (fixture == null) throw new IllegalStateException("Fixture missing: " + logicalRef);
    return fixture;
  }

  public Map<String, Object> find(String logicalRef) {
    return fixtures.get(logicalRef);
  }

  public Map<String, Map<String, Object>> all() {
    return fixtures;
  }
}
