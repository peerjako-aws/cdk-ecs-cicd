import { IRepository } from '@aws-cdk/aws-ecr';
import { CfnTaskDefinition, ContainerDefinition, ContainerImage, ContainerImageConfig } from '@aws-cdk/aws-ecs';
import { CfnParameter, Lazy } from '@aws-cdk/core';

export class PipelineContainerImage extends ContainerImage {
  public readonly imageName: string;
  private readonly repository: IRepository;
  private parameter?: CfnParameter;

  constructor(repository: IRepository) {
    super();
    this.imageName = repository.repositoryUriForTag(Lazy.stringValue({ produce: () => this.parameter!.valueAsString }));
    this.repository = repository;
  }

  public bind(containerDefinition: ContainerDefinition): ContainerImageConfig {
    this.repository.grantPull(containerDefinition.taskDefinition.obtainExecutionRole());
    this.parameter = new CfnParameter(containerDefinition, 'PipelineParam', {
      type: 'String',
    });
    return {
      imageName: this.imageName,
    };
  }

  public get paramName(): string {
    // return cdk.Token.asString(this.parameter!.logicalId).toString();
    return Lazy.stringValue({ produce: () => this.parameter!.logicalId });
  }

  public toRepositoryCredentialsJson(): CfnTaskDefinition.RepositoryCredentialsProperty | undefined {
    return undefined;
  }
}