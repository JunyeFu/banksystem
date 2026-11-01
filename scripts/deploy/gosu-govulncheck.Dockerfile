FROM golang:1.26.9-bookworm@sha256:d9c68c2c51161e12fd77e4c6320687c9cd86e1af1e3ad6e6cd63ff970641453c
ENV GOTOOLCHAIN=local GOTELEMETRY=off GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org
RUN go install golang.org/x/vuln/cmd/govulncheck@v1.9.0
COPY gosu-original /input/gosu
ENTRYPOINT ["/go/bin/govulncheck"]
CMD ["-json", "-mode=binary", "/input/gosu"]
