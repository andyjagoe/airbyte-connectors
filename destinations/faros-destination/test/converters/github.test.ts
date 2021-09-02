import {AirbyteLog, AirbyteLogLevel, AirbyteRecord} from 'faros-airbyte-cdk';
import fs from 'fs';
import _ from 'lodash';
import {getLocal} from 'mockttp';
import os from 'os';
import pino from 'pino';

import {InvalidRecordStrategy} from '../../src';
import {tempConfig} from '../temp';
import {CLI, read} from './../cli';
import {
  githubAllStreamsLog,
  githubLog,
  githubPGRawLog,
  readTestResourceFile,
} from './data';

describe('github', () => {
  const logger = pino({
    name: 'test',
    level: process.env.LOG_LEVEL ?? 'info',
    prettyPrint: {levelFirst: true},
  });
  const mockttp = getLocal({debug: false, recordTraffic: false});
  const catalogPath = 'test/resources/github-catalog.json';
  let configPath: string;
  const graphSchema = JSON.parse(readTestResourceFile('graph-schema.json'));
  const revisionId = 'test-revision-id';
  const streamNamePrefix = 'mytestsource__github__';

  beforeEach(async () => {
    await mockttp.start({startPort: 30000, endPort: 50000});
    configPath = await tempConfig(mockttp.url);
  });

  afterEach(async () => {
    await mockttp.stop();
    fs.unlinkSync(configPath);
  });

  test('process and write records', async () => {
    await mockttp
      .post('/graphs/test-graph/models')
      .withQuery({schema: 'canonical'})
      .once()
      .thenReply(200, JSON.stringify({}));

    await mockttp
      .post('/graphs/test-graph/revisions')
      .once()
      .thenReply(
        200,
        JSON.stringify({
          entrySchema: graphSchema,
          revision: {uid: revisionId, lock: {state: {}}},
        })
      );

    let entriesSize = 0;
    await mockttp
      .post(`/graphs/test-graph/revisions/${revisionId}/entries`)
      .thenCallback(async (r) => {
        entriesSize = r.body.buffer.length;
        return {statusCode: 204};
      });

    await mockttp
      .patch(`/graphs/test-graph/revisions/${revisionId}`)
      .withBody(JSON.stringify({status: 'active'}))
      .once()
      .thenReply(204);

    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
    ]);
    cli.stdin.end(githubLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 96 records');
    expect(stdout).toMatch('Wrote 58 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
    expect(entriesSize).toBeGreaterThan(0);
  });

  test('process records but skip writes when dry run is enabled', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 96 records');
    expect(stdout).toMatch('Would write 58 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('process raw records', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubPGRawLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 111 records');
    expect(stdout).toMatch('Would write 146 records');
    expect(stdout).toMatch('Errored 0 records');
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });

  test('skip to process bad records when strategy is skip', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__github__bad', {bad: 'dummy'})
      ) +
        os.EOL +
        JSON.stringify(
          AirbyteRecord.make('mytestsource__github__something_else', {
            foo: 'bar',
          })
        ) +
        os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 1 records');
    expect(stdout).toMatch('Would write 1 records');
    expect(stdout).toMatch('Errored 1 records');
    expect(await read(cli.stderr)).toMatch('');
    expect(await cli.wait()).toBe(0);
  });

  test('fail to process bad records when strategy is fail', async () => {
    fs.unlinkSync(configPath);
    configPath = await tempConfig(mockttp.url, InvalidRecordStrategy.FAIL);
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(
      JSON.stringify(
        AirbyteRecord.make('mytestsource__github__bad', {bad: 'dummy'})
      ) + os.EOL,
      'utf8'
    );
    const stdout = await read(cli.stdout);
    logger.debug(stdout);
    expect(stdout).toMatch('Processed 0 records');
    expect(stdout).toMatch('Would write 0 records');
    expect(stdout).toMatch('Errored 1 records');
    const stderr = await read(cli.stderr);
    expect(stderr).toMatch('Undefined stream mytestsource__github__bad');
    expect(await cli.wait()).toBeGreaterThan(0);
  });

  test('process records from all streams', async () => {
    const cli = await CLI.runWith([
      'write',
      '--config',
      configPath,
      '--catalog',
      catalogPath,
      '--dry-run',
    ]);
    cli.stdin.end(githubAllStreamsLog, 'utf8');

    const stdout = await read(cli.stdout);
    logger.debug(stdout);

    const processedByStream = {
      assignees: 12,
      branches: 4,
      collaborators: 12,
      comments: 17,
      commit_comments: 1,
      commits: 77,
      events: 300,
      issue_events: 210,
      issue_labels: 24,
      issue_milestones: 1,
      issues: 39,
      organizations: 1,
      projects: 1,
      pull_request_stats: 38,
      pull_requests: 38,
      releases: 1,
      repositories: 49,
      review_comments: 87,
      reviews: 121,
      stargazers: 2,
      tags: 2,
      teams: 1,
      users: 24,
    };
    const processed = _(processedByStream)
      .toPairs()
      .map((v) => [`${streamNamePrefix}${v[0]}`, v[1]])
      .orderBy(0, 'asc')
      .fromPairs()
      .value();

    const writtenByModel = {
      cicd_Release: 1,
      cicd_ReleaseTagAssociation: 1,
      tms_Label: 24,
      tms_Project: 50,
      tms_Task: 1,
      tms_TaskAssignment: 1,
      tms_TaskBoard: 50,
      tms_TaskBoardProjectRelationship: 50,
      tms_TaskBoardRelationship: 1,
      tms_User: 14,
      vcs_Branch: 4,
      vcs_Commit: 77,
      vcs_Membership: 12,
      vcs_Organization: 1,
      vcs_PullRequest: 38,
      vcs_PullRequestComment: 87,
      vcs_PullRequestReview: 121,
      vcs_PullRequest__Update: 38,
      vcs_Repository: 49,
      vcs_Tag: 2,
      vcs_User: 195,
    };

    const processedTotal = _(processedByStream).values().sum(); // total = 1073
    const writtenTotal = _(writtenByModel).values().sum(); // total = 817
    expect(stdout).toMatch(`Processed ${processedTotal} records`);
    expect(stdout).toMatch(`Would write ${writtenTotal} records`);
    expect(stdout).toMatch('Errored 0 records');
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Processed records by stream: ${JSON.stringify(processed)}`
        )
      )
    );
    expect(stdout).toMatch(
      JSON.stringify(
        AirbyteLog.make(
          AirbyteLogLevel.INFO,
          `Would write records by model: ${JSON.stringify(writtenByModel)}`
        )
      )
    );
    expect(await read(cli.stderr)).toBe('');
    expect(await cli.wait()).toBe(0);
  });
});
