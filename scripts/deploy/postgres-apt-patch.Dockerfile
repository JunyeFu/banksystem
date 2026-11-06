FROM postgres:18.6-trixie@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
LABEL org.opencontainers.image.description="RF065 PG18.6 gosu Go1.26.10 and Debian APT3.0.4 security patches"
COPY --chmod=0755 gosu /usr/local/bin/gosu
COPY notices/ /usr/share/doc/gosu-rf065/
COPY packages/ /tmp/rf065-apt-packages/
RUN test ! -d /run/systemd/system \
    && dpkg -i /tmp/rf065-apt-packages/libapt-pkg7.0_3.0.4_amd64.deb /tmp/rf065-apt-packages/apt_3.0.4_amd64.deb \
    && dpkg --audit \
    && apt-get --version
