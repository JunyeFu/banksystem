package local.bank.channel;

import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class TracingFilter extends OncePerRequestFilter {
  private static final String REQUEST_ID = "X-Request-Id";
  private static final String CORRELATION_ID = "X-Correlation-Id";

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws java.io.IOException, jakarta.servlet.ServletException {
    String requestId = request.getHeader(REQUEST_ID);
    if (requestId == null || requestId.isBlank()) requestId = "REQ-" + UUID.randomUUID().toString().substring(0, 12);
    String correlationId = request.getHeader(CORRELATION_ID);
    if (correlationId == null || correlationId.isBlank()) correlationId = "CORR-" + UUID.randomUUID().toString().substring(0, 12);
    MDC.put("requestId", requestId);
    MDC.put("correlationId", correlationId);
    response.setHeader(REQUEST_ID, requestId);
    response.setHeader(CORRELATION_ID, correlationId);
    try {
      chain.doFilter(request, response);
    } finally {
      MDC.clear();
    }
  }
}
