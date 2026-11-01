package local.bank.channel.documents;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class OperationsDocumentRepository {
  private final JdbcTemplate jdbc;

  public OperationsDocumentRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

  public List<Map<String,Object>> list(String category, String status, String keyword) {
    return jdbc.query("""
        SELECT document_id,title,category,status,version,uploaded_by,uploaded_at,file_name,content_type,file_size,checksum,description
        FROM operations_document
        WHERE (?::text IS NULL OR category=?) AND (?::text IS NULL OR status=?)
          AND (?='' OR lower(title) LIKE lower('%'||?||'%') OR lower(COALESCE(description,'')) LIKE lower('%'||?||'%'))
        ORDER BY uploaded_at DESC
        """, (rs,n) -> document(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getString(6),
            rs.getObject(7,OffsetDateTime.class).toString(),rs.getString(8),rs.getString(9),rs.getLong(10),rs.getString(11),rs.getString(12)),
        category,category,status,status,keyword,keyword,keyword);
  }

  public void insert(UUID id, String title, String category, String actor, String fileName,
      String contentType, byte[] bytes, String checksum, String description) {
    jdbc.update("INSERT INTO operations_document(document_id,title,category,status,version,uploaded_by,file_name,content_type,file_size,checksum,description,content) VALUES(?,?,?,'DRAFT',1,?,?,?,?,?,?,?)",
        id,title,category,actor,fileName,contentType,bytes.length,checksum,description,bytes);
  }

  public Optional<Map<String,Object>> find(UUID id) {
    var rows = jdbc.query("SELECT document_id,title,category,status,version,uploaded_by,uploaded_at,file_name,content_type,file_size,checksum,description FROM operations_document WHERE document_id=?",
        (rs,n) -> document(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getInt(5),rs.getString(6),
            rs.getObject(7,OffsetDateTime.class).toString(),rs.getString(8),rs.getString(9),rs.getLong(10),rs.getString(11),rs.getString(12)), id);
    return rows.stream().findFirst();
  }

  public int transition(UUID id, String before, String next, int version) {
    return jdbc.update("UPDATE operations_document SET status=?,version=version+1 WHERE document_id=? AND status=? AND version=?",
        next,id,before,version);
  }

  public Optional<Download> download(UUID id) {
    var rows = jdbc.query("SELECT file_name,content_type,content FROM operations_document WHERE document_id=?",
        (rs,n) -> new Download(rs.getString(1),rs.getString(2),rs.getBytes(3)),id);
    return rows.stream().findFirst();
  }

  private static Map<String,Object> document(String id,String title,String category,String status,int version,String uploadedBy,String uploadedAt,String fileName,String contentType,long fileSize,String checksum,String description) {
    Map<String,Object> item = new LinkedHashMap<>();
    item.put("documentId",id); item.put("title",title); item.put("category",category); item.put("status",status);
    item.put("version",version); item.put("uploadedBy",uploadedBy); item.put("uploadedAt",uploadedAt);
    item.put("fileName",fileName); item.put("contentType",contentType); item.put("fileSize",fileSize);
    item.put("checksum",checksum); item.put("description",description);
    return item;
  }

  public record Download(String fileName, String contentType, byte[] content) {}
}
