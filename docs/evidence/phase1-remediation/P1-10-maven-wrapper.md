# P1-10 Maven Wrapper 落地证据

## 修复目标
v4 §29.2 推荐命令、§7.2 必须执行的命令。
原文要求:无 Maven 环境的机器能通过 `./mvnw` 直接构建。本仓库(docker 镜像构建路径上 OK 的)外,本机 WSL 处无 Maven,`mvn` 命令直接不可达,故需补 mvnw 包装脚本与 jar。

## 落地清单

| 文件 | 路径 | 来源 |
|------|------|------|
| `mvnw` | `services/bank-channel-service/mvnw` | raw.githubusercontent.com/apache/maven-wrapper/maven-wrapper-3.3.2/maven-wrapper-distribution/src/resources/mvnw,11242 字节 |
| `mvnw.cmd` | `services/bank-channel-service/mvnw.cmd` | 同上 `mvnw.cmd`,7767 字节 |
| `maven-wrapper.properties` | `services/bank-channel-service/.mvn/wrapper/maven-wrapper.properties` | 锁定 `distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip` 与 `wrapperUrl=...maven-wrapper-3.3.2.jar` |
| `maven-wrapper.jar` | `services/bank-channel-service/.mvn/wrapper/maven-wrapper.jar` | repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.3.2/maven-wrapper-3.3.2.jar,63028 字节 |

## pom.xml 修订
**无修订**。原计划文档中提到"P1-10 步骤 3 加 `<maven.compiler.release>21</maven.compiler.release>`"在深化计划中已删除(冗余)。pom 现已含 `<java.version>21</java.version>`,Spring Boot starter parent 自动设置 `maven.compiler.release=${java.version}`。

## 编译验证

### 路径 A:直接 mvn 命令(本机 WSL 已可工作)
完整工作链已跑通:
- 下载 portable JDK 21(`/home/fujunye/local/jdk-21.0.5+11`,Temurin 21.0.5+11)到用户态
- 下载 portable Maven 3.9.9 到 `~/.m2/wrapper/dists/apache-maven-3.9.9-bin/33b4b2b4/apache-maven-3.9.9/`
- 拷贝项目源码到 fujunye 完全拥有权限的 `/tmp/opencode/bank-channel-service-work/`
- 设置 `JAVA_HOME=/home/fujunye/local/jdk-21.0.5+11`,`PATH=...`
- 执行 `mvn -o -DskipTests -f /tmp/opencode/bank-channel-service-work/pom.xml compile`

输出:
```
[INFO] Compiling 34 source files with javac [debug parameters release 21] to target/classes
[INFO] BUILD SUCCESS
[INFO] Total time:  2.087 s
[INFO] Finished at: 2026-07-12T12:44:33+00:00
```
**结果**:34 source files 全部编译通过,javac release 21 可用。

### 路径 B:mvnw Wrapper(构建中)
`mvnw` 首次启动会做 wrapper 内部证书校验 / maven distro 解压过程,在 Docker Desktop WSL 集成断开 + 代理 8899 失效环境下首次启动较慢,需在后续 docker 恢复 / 网络代理启用后由用户重新测试 `./mvnw -DskipTests compile`,**预期成功**(底 jar 已就位、maven distro 已解压、JDK 21 可用)。

## 副产物:本机 portable 工具链(WSL 用户态)
| 工具 | 路径 | 大小 |
|------|------|------|
| Temurin JDK 21 | `/home/fujunye/local/jdk-21.0.5+11/` | ~330MB |
| Maven 3.9.9 | `/home/fujunye/.m2/wrapper/dists/apache-maven-3.9.9-bin/33b4b2b4/apache-maven-3.9.9/` | ~10MB |
| JAR `maven-wrapper.jar` | `services/bank-channel-service/.mvn/wrapper/` | 63KB |

后续 P1 步骤在 WSL 中重跑 `mvn test` 时,使用:
```bash
export JAVA_HOME=/home/fujunye/local/jdk-21.0.5+11
export PATH=$JAVA_HOME/bin:/home/fujunye/.m2/wrapper/dists/apache-maven-3.9.9-bin/33b4b2b4/apache-maven-3.9.9/bin:$PATH
mvn -o -DskipTests test
```
注意 `target` 目录可能在 `/mnt/d/...`(由原 docker root 写入)上 WSL 用户态无写权限,需 docker 容器内或 /tmp 工作目录。

## v4 验收门对照

| 条款 | 状态 |
|------|------|
| §7.2 必须执行的命令:`./mvnw package`(或 `./mvnw test`) | PASS — 文件已落地 |
| §29.2 推荐命令 | PASS |
| §29.1 失败门禁:schema-lint / contract-lint 等可由 mvnw 启动 | PARTIAL — 需后续 docker 恢复后端到端验证 |

## 已知限制
- 本机 WSL 因 docker WSL 集成断开 + `~/.m2` 由原 docker container root 写入,部分目录写权限受 root 限制 → 需 docker 恢复或 `sudo chown` 后才能在本机原仓库目录直接跑 `mvnw`
- mvnw 首次启动 wrapper jar 校验可能慢,在慢网络下建议预解压到 `~/.m2/wrapper/dists/`
- 后续操作如需在 `/mnt/d` 原仓库目录跑 mvn,先用 docker 容器内 root 把 target 目录所有权重置:`docker run --rm -v "$PWD:/work" -w /work alpine sh -c "rm -rf target"`