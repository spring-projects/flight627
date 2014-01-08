/*******************************************************************************
 * @license
 * Copyright (c) 2013 Pivotal Software, Inc. and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     Pivotal Software, Inc. - initial API and implementation
*******************************************************************************/

var sys = require('sys')
var crypto = require('crypto');

InMemoryRepository = function() {
};

InMemoryRepository.prototype.projectsStorage = {};
exports.Repository = InMemoryRepository;

InMemoryRepository.prototype.setNotificationSender = function(notificationSender) {
	this.notificationSender = notificationSender;
};

InMemoryRepository.prototype.getProjects = function(username, callback) {
	var projects = [];
	for (projectName in this.projectsStorage) {
		if (typeof this.projectsStorage[projectName] !== 'function') {
			project = {
				'name' : projectName
			};
			projects.push(project);
		}
	}

    callback(null, projects);
};

InMemoryRepository.prototype.hasProject = function(username, projectName) {
	return this.projectsStorage[projectName] !== undefined;
}

InMemoryRepository.prototype.getProject = function(username, projectName, includeDeleted, callback) {
	var project = this.projectsStorage[projectName];
	if (project !== undefined) {
		var resources = [];
		for (resourcePath in project.resources) {
			if (typeof project.resources[resourcePath] !== 'function') {
				var resourceDescription = {};
				resourceDescription.path = resourcePath;
				resourceDescription.type = project.resources[resourcePath].type;
				resourceDescription.timestamp = project.resources[resourcePath].timestamp;
				resourceDescription.hash = project.resources[resourcePath].hash;

				resources.push(resourceDescription);
			}
		}
		
		if (includeDeleted) {
			var deleted = [];
			for (resourcePath in project.deleted) {
				if (typeof project.deleted[resourcePath] !== 'function') {
					var resourceDescription = {};
					resourceDescription.path = resourcePath;
					resourceDescription.timestamp = project.deleted[resourcePath].timestamp;
					deleted.push(resourceDescription);
				}
			}
		    callback(null, resources, deleted);
		}
		else {
		    callback(null, resources);
		}

	}
	else {
	    callback(404);
	}
};

InMemoryRepository.prototype.createProject = function(username, projectName, callback) {
	if (this.projectsStorage[projectName] === undefined) {
		this.projectsStorage[projectName] = {'name' : projectName, 'resources' : {}, 'deleted' : {}};
	    callback(null, {'project': projectName});
	
		this.notificationSender.emit('projectCreated', {
			'username' : username,
			'project' : projectName
		});
	}
	else {
		callback(404);
	}
};

InMemoryRepository.prototype.createResource = function(username, projectName, resourcePath, data, hash, timestamp, type, callback) {
	if (this.projectsStorage[projectName] !== undefined) {
		console.log('putResource ' + resourcePath);
		var project = this.projectsStorage[projectName];
		project.resources[resourcePath] = {
			'data' : data,
			'type' : type,
			'hash' : hash,
			'timestamp' : timestamp,
			'metadata' : {}
		};
		
		if (project.deleted[resourcePath] !== undefined) {
			delete project.deleted[resourcePath];
		}

	    callback(null, {'project': projectName});

		this.notificationSender.emit('resourceCreated', {
			'username' : username,
			'project' : projectName,
			'resource' : resourcePath,
			'hash' : hash,
			'timestamp' : timestamp,
			'type' : type
		});
	}
	else {
		callback(404);
	}
};

InMemoryRepository.prototype.updateResource = function(username, projectName, resourcePath, data, hash, timestamp, callback) {
	if (this.projectsStorage[projectName] !== undefined) {
		console.log('updateResource ' + resourcePath);
		var project = this.projectsStorage[projectName];
		var resource = project.resources[resourcePath];

		if (resource !== undefined && timestamp > resource.timestamp) {
			resource.data = data;
			resource.hash = hash;
			resource.timestamp = timestamp;

		    callback(null, {
				'username' : username,
				'project' : projectName,
				'hash' : hash
			});
							
			this.notificationSender.emit('resourceChanged', {
				'username' : username,
				'project' : projectName,
				'resource' : resourcePath,
				'timestamp' : timestamp,
				'hash' : hash});
		}
		else {
			callback(404);
		}
	}
	else {
		callback(404);
	}
};

InMemoryRepository.prototype.hasResource = function(username, projectName, resourcePath, type) {
	var project = this.projectsStorage[projectName];
	if (project !== undefined) {
		var resource = project.resources[resourcePath];
		if (resource !== undefined) {
			return true;
		}
	}
	return false;
}

InMemoryRepository.prototype.needsUpdate = function(username, projectName, resourcePath, type, timestamp, hash) {
	var project = this.projectsStorage[projectName];
	if (project !== undefined) {
		var resource = project.resources[resourcePath];
		if (resource !== undefined) {
			if (resource.type != type || resource.timestamp < timestamp) {
				return true;
			}
		}
	}
	return false;
}

InMemoryRepository.prototype.gotDeleted = function(username, projectName, resourcePath, timestamp) {
	var project = this.projectsStorage[projectName];
	if (project !== undefined) {
		var deleted = project.deleted[resourcePath];
		if (deleted !== undefined) {
			if (deleted.timestamp > timestamp) {
				return true;
			}
		}
	}
	return false;
}

InMemoryRepository.prototype.updateMetadata = function(username, projectName, resourcePath, metadata, type, callback) {
	if (this.projectsStorage[projectName] !== undefined) {
		console.log('updateMetadata ' + resourcePath);
		var project = this.projectsStorage[projectName];
		var resource = project.resources[resourcePath];

		if (resource !== undefined) {
			resource.metadata[type] = metadata;

		    callback(null, {'project' : projectName
							});
							
			var metadataMessage = {
				'username' : username,
				'project' : projectName,
				'resource' : resourcePath,
				'type' : type,
				'metadata' : metadata
			};
			this.notificationSender.emit('metadataChanged', metadataMessage);
		}
		else {
			callback(404);
		}
	}
	else {
		callback(404);
	}
};

InMemoryRepository.prototype.getResource = function(username, projectName, resourcePath, timestamp, hash, callback) {
	if (this.projectsStorage[projectName] !== undefined) {
		console.log('getResource ' + resourcePath);
		var project = this.projectsStorage[projectName];
		var resource = project.resources[resourcePath];

		if (resource !== undefined) {
			if (timestamp !== undefined && timestamp !== resource.timestamp) {
				callback(404);
			}
			else if (hash !== undefined && hash !== resource.hash) {
				callback(404);
			}
			else {
				callback(null, resource.data, resource.timestamp, resource.hash);
			}
		}
		else {
			callback(404);
		}
	}
	else {
		callback(404);
	}
};

InMemoryRepository.prototype.deleteResource = function(username, projectName, resourcePath, timestamp, callback) {
	if (this.projectsStorage[projectName] !== undefined) {
		console.log('deleteResource ' + resourcePath);
		var project = this.projectsStorage[projectName];
		var resource = project.resources[resourcePath];

		if (resource !== undefined && resource.timestamp < timestamp) {
			delete project.resources[resourcePath];
			project.deleted[resourcePath] = {'timestamp' : timestamp};
			callback(null, {});
			
			this.notificationSender.emit('resourceDeleted', {
				'username' : username,
				'project' : projectName,
				'resource' : resourcePath,
				'timestamp' : timestamp
			});
		}
		else {
			callback(404);
		}
	}
	else {
		callback(404);
	}
};