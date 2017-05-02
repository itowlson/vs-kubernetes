import * as yaml from 'js-yaml';

export type FileType = 'KubernetesJSON' | 'KubernetesYAML' | 'Dockerfile' | 'DockerCompose' | 'Unknown'

export function probe(text : string) : FileType {
    try {
        const j : any = JSON.parse(text);
        if (j.hasOwnProperty('kind') && j.hasOwnProperty('apiVersion')) {
            return 'KubernetesJSON';
        } else {
            return 'Unknown';
        }
    } catch(e) {
        try {
            const y = yaml.safeLoad(text);
            if (y.hasOwnProperty('kind') && y.hasOwnProperty('apiVersion')) {
                return 'KubernetesYAML';
            } else if (y.hasOwnProperty('version') && y.hasOwnProperty('services')) {
                return 'DockerCompose';
            }
        } catch (e) {
            if (text.includes('FROM ') || text.includes('CMD ')) {
                return 'Dockerfile';
            }
            return 'Unknown';
        }
    }
}