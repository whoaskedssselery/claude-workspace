[🇬🇧 English](README.md) · 🇷🇺 Русский

# Claude Workspace

Опинионированный менеджер воркспейсов для Claude Code.

Подготавливает проект под конкретный способ работы — обучение, повседневная работа над проектом,
учебное/тестовое задание, редизайн, вклад в чужой репозиторий — одной командой:

```bash
npx claude-workspace init <preset>
```

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
- **`skills/frontend/`** — [react-best-practices](skills/frontend/react-best-practices/SKILL.md),
  завендорено из [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (MIT).
- **`skills/design/`** — [claude-design](skills/design/claude-design/SKILL.md), завендорено из
  [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) (MIT).
- **`skills/backend/`** — [api-designer](skills/backend/api-designer/SKILL.md) и
  [security-reviewer](skills/backend/security-reviewer/SKILL.md), завендорено из
  [Jeffallan/claude-skills](https://github.com/Jeffallan/claude-skills) (MIT).
- **`skills/formats/`** — оригинальные, не завендоренные:
  [assignment-defend](skills/formats/assignment-defend/SKILL.md) и
  [spike](skills/formats/spike/SKILL.md), опциональные поведенческие варианты (см.
  [Варианты формата](#варианты-формата)).

Всё перечисленное — статичный, портативный `SKILL.md` (+ опциональные reference-файлы) без
собственного установщика, так что `init` копирует его напрямую по первому запросу — флаг для
доменных скиллов не нужен.

## `--with=`: технологии и варианты формата

Пресеты не зашивают стек жёстко, поэтому именно так вы говорите `init`, что реально нужно поверх
базового поведения пресета. `--with=` принимает **любое** известное имя скилла — доменные скиллы,
варианты формата и внешние инструменты одинаково — через запятую, и работает сразу для нескольких
штук:

```bash
npx claude-workspace init learning . --with=react-best-practices
npx claude-workspace init learning . --with=api-designer,security-reviewer
npx claude-workspace init redesign . --with=taste,claude-design
npx claude-workspace init assignment . --with=assignment-defend
```

Флаг не ограничен тем, что уже перечислено в выбранном пресете — `learning` специально поставляется
с пустым списком скиллов, чтобы именно `--with=` решал, какой стек вы изучаете.

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

## Использование

```bash
npx claude-workspace init <preset> [targetDir] [--with-external] [--with=<name,name,...>]
```

## Roadmap

`sync`, `update`, `doctor`, `add` и `remove` — заглушки в CLI (`claude-workspace <command>`), пока не
реализованы.

## Локальная разработка

Пакет ещё не опубликован в npm, поэтому `npx claude-workspace init ...` пока никуда не резолвится.
Чтобы попробовать на реальном проекте до публикации:

```bash
npm pack                        # создаёт claude-workspace-<version>.tgz
cd /path/to/some/test-project
npx -p /absolute/path/to/claude-workspace-<version>.tgz claude-workspace init learning .
```

Замечено, что `npx <tarball-path> <args>` (без `-p`) на Windows/Git Bash молча ничего не делает —
без вывода, без ошибки, exit code 0. Используйте форму `-p <tarball> claude-workspace <args>` выше,
либо просто запустите скрипт напрямую: `node scripts/workspace.js init learning <targetDir>`.
