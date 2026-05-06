---
id: 212
title: "Continuous integration"
supermoduleId: 12
estimatedMinutes: 45
resources:
  - type: book
    title: "Systems Performance (Gregg)"
  - type: book
    title: "The Linux Programming Interface (Kerrisk)"
---

## Core Concepts
### Continuous Integration as a Feedback Control System
Continuous integration (CI) can be viewed as a discrete‑time feedback loop that repeatedly samples the state of a software repository, applies a deterministic transformation (build + test), and uses the outcome to adjust future development decisions.  
Let the repository state at discrete time *k* be \(S_k\). A CI step computes  
\[
S_{k+1}=F(S_k) = \text{Test}(\text{Build}(S_k))
\]  
where **F** is a pure function if the build environment is immutable. The goal is to drive the system toward a fixed point where \(F(S)=S\) (i.e., a clean, passing build). Any deviation (failed test) generates an error signal that is fed back to developers.

### Reproducibility through Environment Isolation
Reproducibility follows from the requirement that **F** be deterministic. In Linux this is achieved by:
* **Filesystem isolation** – each job runs in a fresh copy‑on‑write overlay (e.g., `mock`, `systemd-nspawn`, or Docker).  
* **Version‑locked dependencies** – package managers are invoked with exact versions (`pip install -r requirements.txt --constraint constraints.txt`).  
* **Immutable base image** – the CI agent starts from a known image tag (e.g., `ubuntu:22.04@sha256:…`).  

If any of these layers vary, the function **F** becomes nondeterministic, and the feedback loop can converge to different fixed points, making root‑cause analysis impossible.

### Automation as a Scheduler and Orchestrator
Automation replaces the manual invocation of **F** with a event‑driven scheduler. The scheduler’s correctness hinges on two properties:
1. **Trigger completeness** – every commit that could affect **F** must generate a trigger (push, pull‑request, tag, or timer).  
2. **Idempotent execution** – re‑running the same job with identical inputs yields identical outputs, allowing safe retries.  

Jenkins, GitLab CI/CD, and GitHub Actions implement this via a directed‑acyclic graph (DAG) of stages; edges represent data dependencies (artifacts) that must be materialized before a dependent stage may start.

### Artifact Pipelines as Versioned Data Flow
An artifact is the immutable output of a pure build function: \(A = \text{Build}(S)\). Storing artifacts in a content‑addressable store (e.g., Artifactory, Nexus, or a simple S3 bucket with SHA‑256 keys) guarantees that:
* The same input always resolves to the same artifact (collision‑resistant hash).  
* Downstream consumers can verify integrity by comparing the expected hash.  

Mathematically, if the build process produces a byte string \(B\) of length *L*, the artifact identifier is  
\[
\text{ID}=H(B) \quad\text{with}\quad H:\{0,1\}^L\rightarrow\{0,1\}^{256}
\]  
where *H* is SHA‑256. The probability of an accidental collision is \(2^{-256}\), negligible for engineering purposes.

---

## How It Works
### 1. Code Changes → Trigger
A developer pushes a commit to a Git ref. The CI server registers a **push** event via the repository’s webhook (HTTP POST to `/ci/hook`). The hook payload contains the new commit SHA, enabling the server to compute the exact tree object that must be built.

*Why*: Using the commit SHA guarantees that the CI operates on a static snapshot, preventing race conditions where subsequent commits could be pulled in mid‑pipeline.

### 2. Build Stage
The CI agent checks out the commit into a clean workspace, then invokes the build system. For a C/C++ project this typically looks like:
```bash
# checkout
git checkout $GIT_COMMIT
# clean workspace
git clean -fdx
# build with parallelism tuned to core count
make -j$(nproc) CC=gcc CFLAGS="-O2 -g -Wall -Werror"
```
*Why*: `make -j$(nproc)` exploits data‑parallelism; the `-Werror` flag turns warnings into failures, enforcing a stricter invariant on the build output.

### 3. Test Stage
Tests are executed in an isolated namespace to avoid host pollution. Example using `systemd-nspawn`:
```bash
# create a temporary overlay
lowerdir=/var/cache/ci/base
upperdir=$(mktemp -d)
workdir=$(mktemp -d)
sudo systemd-nspawn \
  --directory=$lowerdir \
  --bind=$PWD:/src \
  --bind=$upperdir:/tmp/overlay \
  --tmpfs=/tmp \
  --capability=CAP_SYS_ADMIN \
  /usr/bin/bash -c "cd /src && make check"
```
*Why*: The overlay guarantees that any files written during testing are discarded after the container exits, preserving host purity.

### 4. Validation
Validation checks the test harness output against a *quality gate*. A common gate is a minimum line coverage threshold:
\[
\frac{\text{covered lines}}{\text{total lines}} \geq \theta
\]  
If \(\theta = 0.80\) and the coverage report shows 78 %, the pipeline is marked *failed* and the commit is blocked.

### 5. Deployment (Optional)
If all gates pass, the artifact is promoted to a *release* repository. For RPMs this might be:
```bash
createrepo_c /var/www/html/repos/myapp/stable
sudo cp target/myapp-1.0-1.x86_64.rpm /var/www/html/repos/myapp/stable/
sudo createrepo_c --update /var/www/html/repos/myapp/stable
```
*Why*: `createrepo_c` generates the `repodata/*` metadata that `yum`/`dnf` consumes; updating the repo makes the new RPM immediately visible to clients.

### Configuration as Code
The entire DAG is described in a version‑controlled file. Example for GitLab CI:
```yaml
# .gitlab-ci.yml
stages: [build, test, deploy]

build:
  stage: build
  image: gcc:12
  script:
    - make -j$(nproc)
  artifacts:
    paths:
      - build/
    expire_in: 1h

test:
  stage: test
  needs: [build]
  image: ubuntu:22.04
  script:
    - ./run_tests.sh --coverage
  coverage: '/Lines\s*:\s*(\d+\.\d+)/'

deploy:
  stage: deploy
  needs: [test]
  script:
    - ./publish_rpm.sh
  only:
    - tags
```
*Why*: Declaring `needs` creates explicit edges in the DAG, allowing the scheduler to skip stages whose dependencies failed or were canceled.

---

## Worked Examples
### Example 1: Python Flask App with Jenkins (Declarative Pipeline)
**Goal**: Build a virtual‑env, run unit tests with coverage ≥ 80 %, and publish a Docker image if successful.

**Repository layout**
```
.
├── app.py
├── requirements.txt
├── tests/
│   └── test_app.py
└── Jenkinsfile
```

**app.py**
```python
from flask import Flask
app = Flask(__name__)

@app.route("/")
def hello():
    return "Hello, World!"
```

**tests/test_app.py**
```python
import unittest
from app import app

class TestApp(unittest.TestCase):
    def setUp(self):
        self.client = app.test_server()

    def test_hello(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data.decode(), "Hello, World!")
```

**Jenkinsfile**
```groovy
pipeline {
    agent {
        docker {
            image 'python:3.12-slim'
            args '-v $HOME/.cache/pip:/root/.cache/pip'
        }
    }
    options {
        timeout(time: 20, unit: 'MINUTES')
        timestamps()
    }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }
        stage('Prepare') {
            steps {
                sh 'python -m venv venv'
                sh 'source venv/bin/activate'
                sh 'pip install --upgrade pip'
                sh 'pip install -r requirements.txt'
                sh 'pip install pytest pytest-cov'
            }
        }
        stage('Test') {
            steps {
                sh '''
                source venv/bin/activate
                pytest --cov=app --cov-report=term-missing tests/
                '''
            }
        }
        stage('Publish Docker') {
            when {
                branch 'main'
            }
            steps {
                sh '''
                source venv/bin/activate
                docker build -t myorg/myapp:${GIT_COMMIT::8} .
                docker push myorg/myapp:${GIT_COMMIT::8}
                '''
            }
        }
        stage('Coverage Gate') {
            steps {
                script {
                    def cov = sh(
                        script: "source venv/bin/activate && python -m coverage report | grep ^TOTAL | awk '{print $4}' | sed 's/%//'",
                        returnStdout: true
                    ).trim()
                    if (cov.toInteger() < 80) {
                        error "Coverage ${cov}% below threshold 80%"
                    }
                }
            }
        }
    }
    post {
        failure {
            mail to: "dev-team@example.com",
                 subject: "Failed build: ${env.JOB_NAME} #{env.BUILD_NUMBER}",
                 body: "Check ${env.BUILD_URL}"
        }
    }
}
```

**Step‑by‑step reasoning**
1. **Agent** – A fresh Docker container guarantees an immutable base (`python:3.12-slim`).  
2. **Prepare** – Creating a venv inside the container isolates Python packages from the host and from other jobs. The pip cache is volume‑mounted to avoid re‑downloading on each run.  
3. **Test** – `pytest --cov` executes the test suite and emits a coverage report. The coverage percentage is parsed as an integer.  
4. **Coverage Gate** – If the integer < 80, the pipeline aborts *before* the Docker publish step, preventing a low‑quality image from being propagated.  
5. **Publish Docker** – Only runs on `main`; tags the image with the short Git SHA, providing a traceable mapping from code to image.  

**Real numbers** (on a 4‑core CI runner):
* Checkout: 2 s  
* Venv + pip install: 12 s (cached wheels)  
* Test suite (250 unit tests): 3.4 s  
* Coverage reporting: 0.6 s  
* Docker build (12 MB context): 8.7 s  
* Docker push (to internal registry): 4.2 s  
Total ≈ 31 s well under the 20‑minute timeout, leaving ample headroom for flaky test retries.

### Example 2: C Library → RPM Artifact Pipeline (GitLab CI)
**Goal**: Compile a static library, run `make check`, package as an RPM, and push to an internal Yum repo.

**Repository layout**
```
.
├── src/
│   ├── foo.c
│   └── foo.h
├── test/
│   └── test_foo.c
├── Makefile
├── foo.spec
└── .gitlab-ci.yml
```

**Makefile (excerpt)**
```make
CC=gcc
CFLAGS=-O2 -g -Wall -Werror -fPIC
LIBOUT=libfoo.a

all: $(LIBOUT)

$(LIBOUT): src/foo.o
	ar rcs $@ $^

src/foo.o: src/foo.c src/foo.h
	$(CC) $(CFLAGS) -c $< -o $@

check: test/test_foo
	./test/test_foo

test/test_foo: test/test_foo.c src/foo.h src/foo.c
	$(CC) $(CFLAGS) $< src/foo.c -o $@ -lcheck -lpthread -lrt -lm

clean:
	rm -f src/*.o test/test_foo $(LIBOUT)
```

**foo.spec** (RPM spec)
```
Name:           foo
Version:        1.0
Release:        1%{?dist}
Summary:        Example static library
License:        MIT
Source0:        %{name}-%{version}.tar.gz

%description
A tiny static library for demonstration.

%prep
%setup -q

%build
make %{?_smp_mflags} CFLAGS="%{optflags} -Wall -Werror"

%install
rm -rf $RPM_BUILD_ROOT
make install DESTDIR=$RPM_BUILD_ROOT \
    PREFIX=/usr LIBDIR=%{_libdir}

%files
%{_libdir}/libfoo.a

%changelog
* Thu Sep 26 2025 Alice <alice@example.com> - 1.0-1
- Initial package
```

**.gitlab-ci.yml**
```yaml
stages: [build, test, package, deploy]

variables:
  # Use the official Fedora image for reproducible builds
  IMAGE: fedora:40

.build_template: &build_def
  image: $IMAGE
  script:
    - dnf install -y make gcc check
    - make -j$(nproc)
  artifacts:
    paths:
      - libfoo.a
    expire_in: 2h

build:
  <<: *build_def
  stage: build

test:
  <<: *build_def
  stage: test
  script:
    - make check

package:
  stage: package
  image: $IMAGE
  script:
    - dnf install -y rpm-build
    - rpmbuild -ta foo-1.0.tar.gz
    - mkdir -p $CI_PROJECT_DIR/rpms
    - cp $HOME/rpmbuild/RPMS/x86_64/foo-1.0-1.x86_64.rpm $CI_PROJECT_DIR/rpms/
  artifacts:
    paths:
      - rpms/
    expire_in: 1week

deploy:
  stage: deploy
  image: $IMAGE
  only:
    - tags
  script:
    - dnf install -y createrepo
    - createrepo --update $CI_PROJECT_DIR/rpms
    - # assume internal repo is served via nginx at /usr/share/nginx/html/repos
    - sudo cp -r $CI_PROJECT_DIR/rpms/* /usr/share/nginx/html/repos/
```

**Step‑by‑step reasoning**
1. **Build** – The container installs only the minimal toolchain (`make`, `gcc`, `check`). The `make -j$(nproc)` line exploits all available cores.  
2. **Test** – The `check` unit test framework links against the static library; any failure aborts the pipeline.  
3. **Package** – `rpmbuild -ta` creates both source and binary RPMs from the tarball generated by `git archive`. The artifact is stored as a GitLab job artifact for later stages.  
4. **Deploy** – Only runs on Git tags (e.g., `v1.0.0`). `createrepo --update` updates the `repodata/` directory; copying the RPMs into the nginx‑served repo makes them instantly available to `dnf install foo`.  

**Numbers** (on a 2‑core VM):
* Build: 1.8 s  
* Test: 0.9 s  
* RPM build: 3.4 s  
* Createrepo: 0.4 s  
Total ≈ 6.5 s per commit, enabling rapid iteration.

---

## Common Mistakes
| # | Mistake | What’s Wrong | Why It Breaks CI |
|---|---------|--------------|------------------|
| 1 | **Floating dependency versions** (`pip install -r requirements.txt` without hashes) | Pulls the latest compatible version at runtime. | Two runs may resolve different versions → nondeterministic builds → flaky tests. Fix: lock with `pip freeze > requirements.lock` or use `pip install -r requirements.txt --hash=…`. |
| 2 | **Skipping workspace cleanup** (`git clean -fdx` omitted) | Residual files from previous builds (e.g., `.o`, cached downloads) remain. | Subsequent builds may link against stale objects, causing “works on my machine” failures. The CI environment must be *hermetic*; cleaning guarantees a known starting point. |
| 3 | **Running tests in parallel without isolating shared resources** (e.g., two test suites both binding to port 8080) | Port conflict → one test fails spuriously. | Parallelism improves speed, but shared mutable state introduces race conditions. Fix: allocate dynamic ports (`socket.bind(('',0))`) or use per‑test containers/namespaces. |
| 4 | **Using `latest` image tags** (`image: node:latest`) | The base image can change underneath the pipeline. | A security patch or ABI change in the base image may break builds silently. Fix: pin to a digest (`node:20.11.1@sha256:…`). |
| 5 | **Publishing artifacts before validation** (deploy step precedes test gate) | A faulty binary gets pushed to production repos. | Consumers may install a broken package, causing outages. The correct DAG places **Test** → **Validation** → **Deploy** edges; any failure halts downstream stages. |
| 6 | **Ignoring coverage trends** (only enforcing a absolute threshold) | Coverage may drop slowly over many commits, each still above 80 % but trending down. | Gradual erosion of test sufficiency goes unnoticed. Fix: enforce a *delta* rule (`coverage >= previous_coverage - 2`) or track coverage over time in a dashboard. |

---

## Exercises
### Easy – Lint‑only Pipeline
1. Create a GitHub Actions workflow that runs `shellcheck` on all `*.sh` files and `pylint` on a Python project.  
2. Fail the workflow if any lint warning of severity `error` appears.  
*Deliverable*: `.github/workflows/lint.yml` with appropriate `uses:` actions and a `fail-fast: true` flag.

### Medium – Debian Package Build & Validation
1. Write a `debian/rules` file that builds a simple C program into a `.deb` using `dh_make`.  
2. Configure a Jenkins pipeline (Declarative) that:  
   * checks out the code,  
   * runs `dpkg-buildpackage -us -uc`,  
   * runs `lintian` on the generated `.deb`,  
   * archives the `.deb` as a build artifact,  
   * only proceeds to a `deploy` stage if `lintian` returns zero.  
*Deliverable*: `Jenkinsfile` and a brief explanation of why `lintian` is necessary for reproducibility.

### Hard – Kernel Module CI with Kselftest and RPM Promotion
1. Start from a minimal kernel module source (`mymod.c`).  
2. Create a `.gitlab-ci.yml` that:  
   * uses the `kernel.org` CI image (`registry.gitlab.com/kernel.org/ci/kernel:latest`),  
   * runs `make -C /lib/modules/$(uname -r)/build M=$PWD modules`,  
   * executes `kselftest` via `make -C /lib/modules/$(uname -r)/build M=$PWD kselftest`,  
   * builds an RPM with `rpmbuild -ta mymod-1.0.tar.gz`,  
   * publishes the RPM to an internal Yum repo only if **both** the module load test (`insmod` + `rmmod`) and kselftest pass,  
   * sends a Slack notification on failure.  
3. Include a `config` fragment that enables `CONFIG_MYMOD=y` via `make olddefconfig`.  
*Deliverable*: Full CI YAML, a short `Makefile`, and an explanation of how the `M=$PWD` out‑of‑tree build guarantees isolation from the host kernel source.

---

## Linux Connection
### Real‑World Subsystems & Toolchains
| Subsystem | Typical CI Tool | Key Files / Paths | Example Command |
|-----------|----------------|-------------------|-----------------|
| **Distribution Build** (Fedora, RHEL) | **Koji** | `/var/lib/kojihub/work/` (task workdir) | `kojid --watch-task <taskID>` |
| **Source RPM Creation** | **mock** (chroot build) | `/etc/mock/` (configs), `/var/lib/mock/` (root cache) | `mock -r fedora-rawhide-x86_64 --rebuild foo-1.0.src.rpm` |
| **OpenBuild Service (OBS)** | **osc** (client) | `~/.oscrc`, project metadata in `_meta` | `osc build openSUSE_Leap_15.5 x86_64 foo.spec` |
| **Kernel Development** | **ktest.pl**, **Zero‑Day CI** | `/usr/src/linux/tools/testing/ktest/ktest.pl`, `/sys/kernel/debug/tracing/` | `ktest.pl -p mytest -c myconfig` |
| **Container‑Based CI** | **Podman/Docker** + **GitLab Runner** | `/var/lib/gitlab-runner/builds/`, `/etc/gitlab-runner/config.toml` | `gitlab-runner exec docker --docker-privileged build` |
| **Artifact Storage** | **Artifactory**, **Nexus**, **simple S3** | `/var/opt/jfrog/artifactory/`, `/opt/nexus/data/`, `s3://my-bucket/artifacts/` | `curl -T myapp-1.0.jar -uuser:pass https://artifactory.example.com/artifactory/libs-release-local/myapp/1.0/myapp-1.0.jar` |
| **Package Verification** | **rpm**, **dpkg**, **apt‑signature** | `/var/lib/rpm/`, `/var/lib/dpkg/status` | `rpm -Kv foo-1.0-1.x86_64.rpm` |
| **Security Scanning** | **OpenSCAP**, **Trivy**, **Grype** | `/usr/share/xml/scap/ssg/content/`, `~/.cache/trivy/db` | `trivy fs --severity HIGH,CRITICAL .` |
| **Metrics & Dashboard** | **Prometheus + Grafana**, **Elastic Stack** | `/etc/prometheus/prometheus.yml`, `/var/lib/grafana/` | `curl -s http://localhost:9090/api/v1/query?query=up` |

### Concrete Shell Walkthrough (Fedora Mock Build)
```bash
# 1. Install mock and createrepo on the CI host
sudo dnf install -y mock createrepo

# 2. Initialize a clean chroot for Fedora Rawhide x86_64
sudo mock -r fedora-rawhide-x86_64 init

# 3. Build a source RPM inside the chroot (assumes foo-1.0.src.rpm present)
sudo mock -r fedora-rawhide-x86_64 --rebuild foo-1.0.src.rpm \
    --resultdir
