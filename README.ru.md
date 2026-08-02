[🇬🇧 English](README.md) · 🇷🇺 Русский

# Claude Workspace

[![CI](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml/badge.svg)](https://github.com/whoaskedssselery/claude-workspace/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Опинионированный менеджер воркспейсов для Claude Code.

Подготавливает проект под конкретный способ работы — обучение, повседневная работа над проектом,
учебное/тестовое задание, редизайн, вклад в чужой репозиторий — одной командой. Установите
глобально любым пакетным менеджером, каким пользуетесь:

```bash
npm install -g claude-workspace    # или: pnpm add -g / yarn global add / bun add -g claude-workspace
claude-workspace init
```

Это запускает [интерактивный мастер](#интерактивный-мастер) — выбор (или создание) пресета, выбор
дополнительных скиллов, подтверждение — это основной способ пользоваться тулой. Хотите
заскриптовать (CI, автоматизация, или уже точно знаете, что нужно)? Укажите имя пресета и флаги
напрямую, без вопросов:

```bash
claude-workspace init <preset>
```

Не хотите ставить глобально? У каждого пакетного менеджера есть свой аналог "запустить без
установки", и все они работают одинаково:

| Пакетный менеджер | Мастер | Скриптуемый вариант |
|---|---|---|
| npm | `npx claude-workspace init` | `npx claude-workspace init <preset>` |
| pnpm | `pnpm dlx claude-workspace init` | `pnpm dlx claude-workspace init <preset>` |
| yarn | `yarn dlx claude-workspace init` | `yarn dlx claude-workspace init <preset>` |
| bun | `bunx claude-workspace init` | `bunx claude-workspace init <preset>` |

Команда устанавливает в текущую директорию:

- `.claude/skills/` — скиллы пресета, работают автоматически, без ручного вызова
- `.claude/workspace.yaml` — манифест установленного пресета и скиллов
- `CLAUDE.md` — сгенерированная точка входа проекта (не трогается, если уже существует)
- небольшой помеченный блок в конце `.gitignore` (файл создаётся, если его нет) — для того, что
  реально личное и не должно коммититься: `.claude/settings.local.json` и `.DS_Store`.
  `.claude/skills/`, `.claude/workspace.yaml` и `CLAUDE.md` **намеренно не игнорируются** — в этом
  весь смысл тулы, их нужно коммитить и делиться с командой.

Скиллы устанавливаются в том формате, который ожидает Claude Code: одна директория на скилл,
`.claude/skills/<name>/SKILL.md`.

## Пресеты

Пресеты — это паттерны использования, а не стеки технологий. Ни один из них не привязан жёстко к
React или бэкенду — выбираете пресет под то, *как* вы работаете, а конкретную технологию добавляете
через `--with=` (см. ниже).

| Пресет | Core-поведение | Для чего |
|---|---|---|
| `learning` | [learning-guard](skills/core/learning-guard/SKILL.md), [teacher](skills/core/teacher/SKILL.md), [health-review](skills/core/health-review/SKILL.md), [commit-discipline](skills/core/commit-discipline/SKILL.md), [codegraph](skills/core/codegraph/SKILL.md) | Обучение любой технологии. Весь код пишет человек; Claude учит, ревьюит, помогает с дизайном. Эти core-скиллы описывают только паттерны преподавания/ревью и нигде не называют конкретную технологию — скажите Claude, что реально изучаете, и добавьте это через `--with=` (см. ниже). |
| `project` | health-review, commit-discipline, codegraph | Повседневная работа над существующим/боевым проектом. Без учебных ограничений — Claude пишет код как обычно. Добавьте `--with=spike` для конкретного куска одноразовой/исследовательской работы — см. [Варианты формата](#варианты-формата). |
| `assignment` | [assignment-mode](skills/core/assignment-mode/SKILL.md), commit-discipline, codegraph | Учебные задания в вузе, тестовые задания, оцениваемые упражнения. Claude может писать решение напрямую, проверяет, что оно реально работает, и не выходит за рамки условия. Добавьте `--with=assignment-defend`, если преподаватель будет требовать объяснений — см. [Варианты формата](#варианты-формата). |
| `redesign` | health-review, commit-discipline, codegraph | Проекты, где нужна визуальная работа, а не обучение — без learning-guard/teacher. Скиллы: [react-best-practices](skills/frontend/react-best-practices/SKILL.md); external: `taste`, `ui-ux-pro-max`, `impeccable`. Добавьте `--with=claude-design` для [режима создания HTML-дизайн-артефактов](skills/design/claude-design/SKILL.md) — по умолчанию не ставится, не каждому редизайну это нужно. |
| `oss-contribution` | commit-discipline, codegraph | Вклад в чужой репозиторий — минимальные диффы, следование существующим конвенциям. |

## Варианты формата

У некоторых пресетов есть два реально разных поведения в зависимости от обстоятельств вне самого
кода — это выбор не технологии, а *насколько строго/сколько объяснений нужно*. Они лежат в
`skills/formats/` и подключаются так же, как технологический скилл — через `--with=`:

- **Задание: сдать vs объяснить.** Одни преподаватели просто запускают код и проверяют результат;
  другие расспрашивают про решение или требуют устной защиты. `assignment` уже проверяет, что
  решение работает в любом случае — добавьте
  [`assignment-defend`](skills/formats/assignment-defend/SKILL.md), когда придётся реально
  объяснять или защищать работу: это добавляет короткий "лист защиты" (вероятные вопросы + ответы),
  предложение опросить вас по материалу и более глубокий разбор кода по запросу.

  ```bash
  npx claude-workspace init assignment . --with=assignment-defend
  ```

- **Проект: набросок vs продакшн.** Иногда нужно просто понять, работает ли идея; иногда — реально
  катить в продакшн. Дефолты `project` (health-review, commit-discipline) рассчитаны на второе.
  Добавьте [`spike`](skills/formats/spike/SKILL.md), когда осознанно хотите двигаться быстро и
  выбросить код потом — он ослабляет эти дефолты именно для этого куска работы и явно предупреждает
  перед тем, как черновой код начнут воспринимать как готовый к продакшну.

  ```bash
  npx claude-workspace init project . --with=spike
  ```

## Каталог скиллов

- **`skills/core/`** — поведенческие скиллы, копируются в любой пресет, который их перечисляет.
  `codegraph` живёт именно тут (а не в доменной папке), потому что это универсальный инструмент
  навигации по коду, полезный в любой области, а не только во фронтенде — так он не требует
  повторного объяснения/подключения под каждый стек и экономит токены.
- **`skills/frontend/`** — react-best-practices (завендорено из
  [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills), MIT), плюс react-expert,
  vue-expert и graphql-architect (из [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills), MIT).
- **`skills/design/`** — [claude-design](skills/design/claude-design/SKILL.md), завендорено из
  [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) (MIT).
- **`skills/backend/`** — api-designer, security-reviewer, database-optimizer,
  microservices-architect и websocket-engineer.
- **`skills/fullstack/`** — fullstack-guardian (согласованность фронта и бэка, общие контракты).
- **`skills/ml/`** — ml-pipeline, rag-architect, fine-tuning-expert, pandas-pro, spark-engineer.
- **`skills/devops/`** — devops-engineer, kubernetes-specialist, terraform-engineer, cloud-architect.
- **`skills/general/`** — code-reviewer, debugging-wizard, test-master — сквозные, не привязаны к
  одному домену.
- **`skills/planning/`** — [feature-forge](skills/planning/feature-forge/SKILL.md): структурированные
  воркшопы по требованиям — user stories, требования в формате EARS, критерии приёмки, чеклисты
  реализации. По умолчанию не встроен ни в один пресет — добавляйте `--with=feature-forge`, где
  нужен этап планирования перед разработкой.
- **`skills/formats/`** — оригинальные, не завендоренные:
  [assignment-defend](skills/formats/assignment-defend/SKILL.md) и
  [spike](skills/formats/spike/SKILL.md), опциональные поведенческие варианты (см.
  [Варианты формата](#варианты-формата)).

Всё в `skills/frontend`, `backend`, `fullstack`, `ml`, `devops`, `general` и `planning` (кроме
react-best-practices и claude-design) завендорено из
[Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) (MIT) — весь список с
описаниями смотрите через `claude-workspace list`.

Всё перечисленное — статичный, портативный `SKILL.md` (+ опциональные reference-файлы) без
собственного установщика, так что `init` копирует его напрямую по первому запросу — флаг для
доменных скиллов не нужен.

## `--with=`: технологии и варианты формата

Пресеты не зашивают стек жёстко, поэтому именно так вы говорите `init`, что реально нужно поверх
базового поведения пресета. `--with=` принимает **любое** известное имя скилла — доменные скиллы,
варианты формата и внешние инструменты одинаково — через запятую, и работает сразу для нескольких
штук:

```bash
claude-workspace init learning . --with=react-best-practices
claude-workspace init learning . --with=api-designer,security-reviewer,database-optimizer
claude-workspace init redesign . --with=taste,claude-design
claude-workspace init assignment . --with=assignment-defend
claude-workspace init project . --with=feature-forge
```

Флаг не ограничен тем, что уже перечислено в выбранном пресете — `learning` специально поставляется
с пустым списком скиллов, чтобы именно `--with=` решал, какой стек вы изучаете.

Опечатка в имени не проходит молча — `init`/`sync` предлагают ближайшее известное совпадение:

```
! "databse-optimizer" isn't a known skill or external tool — skipped (did you mean "database-optimizer"?)
```

## Внешние инструменты

Некоторые названные скиллы — это полноценные инструменты со своим установщиком или маркетплейсом
плагинов, а не портативный файл — вендорить копию значило бы сразу разойтись с апстримом. `init`
никогда не тянет их по умолчанию, только печатает команду установки:

| Имя | Источник | Команда установки |
|---|---|---|
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | `npx impeccable install --providers=claude --scope=project` |
| `superpowers` | [obra/superpowers](https://github.com/obra/superpowers) | `claude plugin marketplace add obra/superpowers-marketplace`, затем `claude plugin install superpowers@superpowers-marketplace --scope project` |
| `taste` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `npm install -g ui-ux-pro-max-cli`, затем `uipro init --ai claude` |

`--with=<имя>` реально ставит именно этот инструмент (запускает его установщик); `--with-external`
ставит все внешние инструменты, перечисленные в выбранном пресете. Без обоих флагов `init` просто
печатает команду. Если установщик недоступен даже при указанном флаге (нет сети, `claude`/`npx` не
в PATH) — `init` не падает, а печатает команду для ручной установки и продолжает работу.

## Интерактивный мастер

**Это основной способ пользоваться тулой.** Запускается `init` без имени пресета в интерактивном
терминале:

```bash
claude-workspace init
```

Флаги и имена пресетов — всё, что описано выше — это скриптуемый/продвинутый путь для CI,
автоматизации или когда вы уже точно знаете, что нужно; мастер — то, к чему тянешься день за днём.

Он проводит через те же решения пошагово вместо флагов заранее, каждый экран помечен тем, на каком
вы шаге:

1. **Язык** — русский или английский. Запоминается в `~/.claude-workspace/config.json`, спросит
   только один раз, навсегда.
2. **Пресет** — выбрать встроенный, ранее сохранённый кастомный, либо "создать свой пресет".
3. **Дополнительные скиллы** — чекбокс-список, разбитый на domain skills, релевантные варианты
   формата (только `assignment-defend` для `assignment`, только `spike` для `project` — никогда
   оба сразу) и external tools, у каждого — однострочная подсказка прямо из его `SKILL.md`.
4. Если выбраны external tools: **установить их прямо сейчас или только показать команды?**
5. **Подтверждение** — цветная сводка того, что именно будет создано, затем выполнение (или
   отмена).

При создании кастомного пресета вместо этого показывается весь каталог (все папки `skills/` плюс
external tools), а в конце спрашивается, **куда его сохранить**: в `.claude-workspace/presets/<name>.yaml`
внутри текущего проекта (закоммитить — после клона его увидит вся команда), в
`~/.claude-workspace/presets/<name>.yaml` (лично для вас, в любом проекте), либо никуда. В обоих
случаях `claude-workspace init <name>` дальше работает неинтерактивно точно так же, как встроенный
пресет (см. [Кастомные пресеты](#кастомные-пресеты)).

**Клавиши:** стрелки (или `j`/`k`) — движение, `space` — переключить пункт чекбокса, цифры `1`-`9`
— перейти сразу (а в чекбоксах — ещё и переключить) к одному из первых девяти пунктов, `a`/`n` —
выбрать все/ничего в чекбоксе, `enter` — подтвердить, `esc`/`Ctrl+C` — отменить в любой момент,
ничего не записав.

Всё это без зависимостей — никакого `inquirer`, только встроенный `readline` Node плюс обычные
ANSI-коды для цвета/жирного/тусклого текста (автоматически отключаются, если вывод не в реальный
терминал, или если задан `NO_COLOR` — https://no-color.org). Нужен настоящий TTY для raw-mode ввода
с клавиатуры — запуск из скрипта, CI или с stdin из файла аккуратно откатывается к понятной ошибке
с просьбой указать имя пресета явно.

## Кастомные пресеты

Пресеты не ограничены пятью встроенными. Кастомный пресет — созданный через путь "создать свой
пресет" в мастере, либо написанный вручную в том же формате, что встроенные в
[`presets/`](presets/) — живёт в одном из двух мест:

- `.claude-workspace/presets/<name>.yaml` в текущем проекте — закоммитьте, и после клона у каждого
  в команде сразу заработает `claude-workspace init <name>`, без ручной настройки на каждой машине.
- `~/.claude-workspace/presets/<name>.yaml` — лично для вас, доступен в любом проекте на вашей
  машине, никогда не расшаривается.

Оба варианта подхватываются `init`/`list` точно так же, как встроенный пресет. Встроенные пресеты
всегда имеют приоритет при совпадении имени, так что кастомный пресет не может случайно перекрыть
`learning`, `project` и т.д.; project-local пресет имеет приоритет над одноимённым глобальным.

## Добавление скилла из любого репозитория

```bash
claude-workspace add vercel-labs/agent-skills
claude-workspace add https://github.com/owner/repo/tree/main/skills/some-skill
```

`add` не ограничен собственным каталогом пакета — передайте что угодно похожее на URL, git-remote
или `owner/repo`, и оно будет скачано через [`npx skills`](https://github.com/vercel-labs/skills)
(тот же CLI, из которого этот проект уже вендорит `react-best-practices`) прямо в
`.claude/skills/`, а затем записано в `workspace.yaml` в секцию `remote:`, так что `sync`/`doctor`/
`remove` тоже про него знают. `sync` перескачивает его из записанного источника, подхватывая
изменения выше по течению; `remove` удаляет локальную копию и прекращает отслеживание (сам
репозиторий скилла не трогается).

## Управление существующим воркспейсом

```bash
claude-workspace doctor            # всё ли реально установлено и актуально?
claude-workspace add <name...>     # добавить один или несколько скиллов/тулов к уже установленным
claude-workspace remove <name...>  # убрать один или несколько скиллов/тулов
claude-workspace update            # npm install -g claude-workspace@latest, затем sync
```

`doctor` для каждого скилла, перечисленного в `.claude/workspace.yaml`, сообщает: **ok**
(установлен и совпадает с текущей версией пакета), **outdated** (установлен, но содержимое разошлось
— нужен `sync`), либо **missing**. Также печатает версию `claude-workspace`, с которой этот
воркспейс синхронизировался в последний раз, против той, что запущена сейчас (несовпадение — сигнал
для команды, где не все обновляются одновременно), и проверяет наличие `CLAUDE.md` и блока в
`.gitignore`.

`add`/`remove` — это как разовая версия `--with=`: устанавливают (или удаляют) скилл и обновляют
`workspace.yaml`, без перезапуска всего `init`. Удаление external tool только прекращает его
отслеживание в `workspace.yaml` — сам инструмент своим деинсталлятором не удаляется.

`update` — best-effort: угадывает, каким пакетным менеджером управляется текущая установка, по
реальному пути файла (у pnpm/yarn/bun своя узнаваемая директория глобальной установки; всё
остальное по умолчанию считается npm) и запускает команду обновления именно этого менеджера. Под
`npx`/`pnpm dlx` (определяется по собственному сигналу npm `npm_command=exec`, плюс проверка по
пути для pnpm/yarn) этот шаг полностью пропускается, а не оставляет ненужную глобальную установку —
эти раннеры и так всегда берут последнюю версию. В любом случае в конце выполняется `sync`.

`CLAUDE.md` — теперь блок с маркерами (`<!-- claude-workspace:start/end -->`), а не файл целиком:
`sync` обновляет содержимое между маркерами при каждом запуске, а всё, что вы или коллега написали
за их пределами, никогда не трогается. `init --force` вставляет блок в существующий `CLAUDE.md`, у
которого его ещё нет (а не перезаписывает файл целиком, как раньше делал `--force`).

## Использование

```bash
claude-workspace init                                       (интерактивный мастер, нужен TTY)
claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,...>] [--force]
claude-workspace list [--installed]
claude-workspace sync [targetDir]
claude-workspace add <name...>
claude-workspace remove <name...>
claude-workspace doctor [targetDir]
claude-workspace update [targetDir]
```

`list` печатает все пресеты, скиллы и внешние инструменты, о которых знает пакет, с однострочным
описанием каждого — каталог разросся настолько, что проще посмотреть это, чем читать репозиторий.
`list --installed` вместо этого показывает только то, что реально установлено в
`.claude/workspace.yaml` текущей директории.

`sync` заново копирует то, что перечислено в `.claude/workspace.yaml`, из текущей установленной
версии пакета `claude-workspace` — используйте после обновления пакета, чтобы подтянуть изменения
содержимого скиллов без повторного `init`. Также обновляет блок `claude-workspace` в `CLAUDE.md` и
перескачивает remote-скиллы (добавленные по URL), но не перезапускает установщики внешних
инструментов (обновляйте их своим CLI, например `codegraph upgrade`, `uipro update`).

`init --force` вставляет свежий блок `claude-workspace` в существующий `CLAUDE.md`, у которого его
ещё нет, вместо того чтобы оставить файл нетронутым — подробнее про маркер-блок см. [Управление
существующим воркспейсом](#управление-существующим-воркспейсом).

## Roadmap

Осознанно не реализовано (пока):

- **Закрепление точной версии/хэша скилла в `workspace.yaml`.** Скиллы сейчас не версионируются
  отдельно от самого пакета; настоящий пер-скилловый pinning — более крупный архитектурный вопрос
  (что вообще значит "закрепить" сквозь обновление пакета?), чем стоит решать походя вместе со всем
  остальным здесь.
- **Поддержка монорепо**, **post-init хуки**, **экспорт/импорт всего конфига воркспейса.** Пока нет
  конкретной потребности в этом — с удовольствием спроектирую как надо, когда появится реальный
  кейс, диктующий требования, а не буду гадать сейчас.

## Структура проекта

```
scripts/workspace.js   точка входа CLI — только разбор argv и текст --help
scripts/lib/catalog.js   что поставляет пакет: пресеты, скиллы, external tools, мини-YAML-парсер
scripts/lib/manifest.js  установленный воркспейс конкретного проекта: workspace.yaml, блок CLAUDE.md, .gitignore
scripts/lib/remote.js    скачивание скилла из произвольного репозитория ("add <url>")
scripts/lib/pm.js        определение пакетного менеджера / npx-dlx, нужно для "update"
scripts/lib/commands.js  реализация команд поверх четырёх файлов выше
scripts/lib/wizard.js    интерактивный мастер "init" (грузится только когда реально вызван)
scripts/lib/{i18n,prompt,colors}.js   строительные блоки мастера (переведённые строки, движок prompt'ов на стрелках, ANSI-стили)
```

Каждый файл ре-экспортируется через `scripts/workspace.js`, так что `wizard.js` и тесты импортируют
всё из этого одного знакомого пути, независимо от того, какой lib-файл реально чем владеет.

## Локальная разработка

Пакет опубликован в npm, так что оба варианта из начала README — глобальная установка и `npx` —
реально работают на последней опубликованной версии. Чтобы попробовать локальные изменения до
публикации новой версии:

```bash
npm pack                        # создаёт claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init learning .
```

Замечено, что `npx <tarball-path> <args>` (без `-p`) на Windows/Git Bash молча ничего не делает —
без вывода, без ошибки, exit code 0. Используйте форму `-p <tarball> claude-workspace <args>` выше,
либо просто запустите скрипт напрямую: `node scripts/workspace.js init learning <targetDir>`.

## Тесты

Ноль зависимостей — в том числе для тестов, они гоняются на встроенном тест-раннере Node:

```bash
npm test
```

Покрывает мини-парсер YAML, логику подсказок по опечаткам (Левенштейн), извлечение description из
frontmatter, слияние `.gitignore` (идемпотентность и сохранение существующего содержимого),
`init`/`sync`/`doctor`/`add`/`remove` end-to-end на реальных пресетах и скиллах во временной
директории, кастомные пресеты в изолированном фейковом `~/.claude-workspace` (через переменную
окружения `CLAUDE_WORKSPACE_HOME`, чтобы тесты никогда не трогали настоящую домашнюю директорию),
поиск строк i18n и логику подготовки данных для мастера (какие скиллы/варианты формата предлагаются
для какого пресета) без реального ввода с клавиатуры. Сам raw-mode цикл ввода мастера требует
настоящего TTY и не может быть осмысленно прогнан автотестом, поэтому эта часть проверена вручную, а
не в CI. Гоняется на Node 18/20/22 при каждом push и PR.

## Лицензия

[MIT](LICENSE)
