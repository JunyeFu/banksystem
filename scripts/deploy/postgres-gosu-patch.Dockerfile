FROM postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
LABEL org.opencontainers.image.description="RF065 local gosu1.19 Moby0.4.1 Go1.26.10 security patch; PostgreSQL18.6 unchanged"
COPY --chmod=0755 gosu /usr/local/bin/gosu
COPY notices/ /usr/share/doc/gosu-rf065/
