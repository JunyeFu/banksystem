package local.bank.channel;

import java.sql.Connection;
import java.sql.SQLException;
import javax.sql.DataSource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;

/** Serializes core money commands against EOD without opening a SQL transaction. */
@Repository
public class CoreWriteRepository {
  private final DataSource dataSource;
  public CoreWriteRepository(DataSource dataSource) { this.dataSource = dataSource; }

  public Lease acquire() {
    Connection connection = null;
    boolean acquired = false;
    try {
      connection = dataSource.getConnection();
      try (var query = connection.prepareStatement("SELECT pg_try_advisory_lock_shared(hashtext('eod:core-jobs'))")) {
        try (var result = query.executeQuery()) {
          result.next();
          acquired = result.getBoolean(1);
        }
      }
      if (!acquired) throw blocked();
      try (var query = connection.prepareStatement("SELECT 1 FROM eod_run WHERE status IN ('RUNNING','INTERRUPTED') LIMIT 1")) {
        try (var result = query.executeQuery()) {
          if (result.next()) throw blocked();
        }
      }
      return new Lease(connection);
    } catch (SQLException | RuntimeException error) {
      if (connection != null) {
        try {
          if (acquired) unlock(connection);
        } catch (SQLException releaseError) { error.addSuppressed(releaseError); }
        finally {
          try { connection.close(); } catch (SQLException closeError) { error.addSuppressed(closeError); }
        }
      }
      if (error instanceof RuntimeException runtime) throw runtime;
      throw new IllegalStateException("Core write barrier unavailable", error);
    }
  }

  private static ResponseStatusException blocked() {
    return new ResponseStatusException(HttpStatus.CONFLICT, "CORE_WRITES_BLOCKED_BY_EOD");
  }

  private static void unlock(Connection connection) throws SQLException {
    try (var query = connection.prepareStatement("SELECT pg_advisory_unlock_shared(hashtext('eod:core-jobs'))")) {
      query.execute();
    }
  }

  public static final class Lease implements AutoCloseable {
    private final Connection connection;
    private Lease(Connection connection) { this.connection = connection; }
    @Override public void close() {
      try { unlock(connection); }
      catch (SQLException error) { throw new IllegalStateException("Core write barrier release failed", error); }
      finally {
        try { connection.close(); }
        catch (SQLException error) { throw new IllegalStateException("Core write barrier connection close failed", error); }
      }
    }
  }
}
