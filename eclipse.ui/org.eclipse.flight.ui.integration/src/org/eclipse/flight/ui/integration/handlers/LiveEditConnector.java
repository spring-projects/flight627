/*******************************************************************************
 * Copyright (c) 2013 Pivotal Software, Inc. and others.
 * All rights reserved. This program and the accompanying materials are made 
 * available under the terms of the Eclipse Public License v1.0 
 * (http://www.eclipse.org/legal/epl-v10.html), and the Eclipse Distribution 
 * License v1.0 (http://www.eclipse.org/org/documents/edl-v10.html). 
 *
 * Contributors:
 *     Pivotal Software, Inc. - initial API and implementation
*******************************************************************************/
package org.eclipse.flight.ui.integration.handlers;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.flight.core.ILiveEditConnector;
import org.eclipse.flight.core.LiveEditCoordinator;
import org.eclipse.flight.core.EclipseRepository;
import org.eclipse.jface.text.DocumentEvent;
import org.eclipse.jface.text.IDocument;
import org.eclipse.jface.text.IDocumentListener;
import org.eclipse.swt.widgets.Display;
import org.eclipse.ui.IPartListener2;
import org.eclipse.ui.IWorkbenchPart;
import org.eclipse.ui.IWorkbenchPartReference;
import org.eclipse.ui.IWorkbenchWindow;
import org.eclipse.ui.PlatformUI;
import org.eclipse.ui.texteditor.AbstractTextEditor;

/**
 * @author Martin Lippert
 */
public class LiveEditConnector {
	
	private static final String LIVE_EDIT_CONNECTOR_ID = "UI-Editor-Live-Edit-Connector";
	
	private IDocumentListener documentListener;
	private EclipseRepository repository;
	
	private ConcurrentMap<IDocument, String> resourceMappings;
	private ConcurrentMap<String, IDocument> documentMappings;
	private LiveEditCoordinator liveEditCoordinator;

	public LiveEditConnector(LiveEditCoordinator liveEditCoordinator, EclipseRepository repository) {
		this.liveEditCoordinator = liveEditCoordinator;
		this.repository = repository;
		
		this.resourceMappings = new ConcurrentHashMap<IDocument, String>();
		this.documentMappings = new ConcurrentHashMap<String, IDocument>();
		
		this.documentListener = new IDocumentListener() {
			@Override
			public void documentChanged(DocumentEvent event) {
				sendModelChangedMessage(event);
			}
			@Override
			public void documentAboutToBeChanged(DocumentEvent event) {
			}
		};
		
		ILiveEditConnector liveEditConnector = new ILiveEditConnector() {
			@Override
			public String getConnectorID() {
				return LIVE_EDIT_CONNECTOR_ID;
			}

			@Override
			public void liveEditingEvent(String username, String resourcePath, int offset, int removeCount, String newText) {
				handleModelChanged(username, resourcePath, offset, removeCount, newText);
			}

			@Override
			public void liveEditingStarted(String requestSenderID, int callbackID, String username, String resourcePath, String hash, long timestamp) {
				// TODO Auto-generated method stub
			}

			@Override
			public void liveEditingStartedResponse(String requestSenderID, int callbackID, String username, String projectName, String resourcePath,
					String content) {
				// TODO Auto-generated method stub
			}
		};
		this.liveEditCoordinator.addLiveEditConnector(liveEditConnector);
		
		Display.getDefault().asyncExec(new Runnable() {
			public void run() {
				IWorkbenchWindow window = PlatformUI.getWorkbench().getActiveWorkbenchWindow();
				window.getActivePage().addPartListener(new IPartListener2() {
					@Override
					public void partVisible(IWorkbenchPartReference partRef) {
					}
					@Override
					public void partOpened(IWorkbenchPartReference partRef) {
						IWorkbenchPart part = partRef.getPart(false);
						if (part instanceof AbstractTextEditor) {
							connectEditor((AbstractTextEditor) part);
						}
					}
					@Override
					public void partInputChanged(IWorkbenchPartReference partRef) {
					}
					@Override
					public void partHidden(IWorkbenchPartReference partRef) {
					}
					@Override
					public void partDeactivated(IWorkbenchPartReference partRef) {
					}
					@Override
					public void partClosed(IWorkbenchPartReference partRef) {
						IWorkbenchPart part = partRef.getPart(false);
						if (part instanceof AbstractTextEditor) {
							disconnectEditor((AbstractTextEditor) part);
						}
					}
					@Override
					public void partBroughtToTop(IWorkbenchPartReference partRef) {
					}
					@Override
					public void partActivated(IWorkbenchPartReference partRef) {
					}
				});
			}
		});
	}
	
	protected void handleModelChanged(final String username, final String resourcePath, final int offset, final int removedCharCount, final String newText) {
		if (repository.getUsername().equals(username) && resourcePath != null && documentMappings.containsKey(resourcePath)) {
			final IDocument document = documentMappings.get(resourcePath);
			
			try {
				Display.getDefault().asyncExec(new Runnable() {
					public void run() {
						try {
							document.removeDocumentListener(documentListener);
							document.replace(offset, removedCharCount, newText);
							document.addDocumentListener(documentListener);
						}
						catch (Exception e) {
							e.printStackTrace();
						}
					}
				});
			}
			catch (Exception e) {
				e.printStackTrace();
			}
		}
	}

	protected void sendModelChangedMessage(DocumentEvent event) {
		String resourcePath = resourceMappings.get(event.getDocument());
		if (resourcePath != null) {
			String projectName = resourcePath.substring(0, resourcePath.indexOf('/'));
			String relativeResourcePath = resourcePath.substring(projectName.length() + 1);

			this.liveEditCoordinator.sendModelChangedMessage(LIVE_EDIT_CONNECTOR_ID, repository.getUsername(), projectName, relativeResourcePath, event.getOffset(), event.getLength(), event.getText());
		}
	}

	protected void connectEditor(AbstractTextEditor texteditor) {
		final IDocument document = texteditor.getDocumentProvider().getDocument(texteditor.getEditorInput());
		IResource resource = (IResource) texteditor.getEditorInput().getAdapter(IResource.class);
		
		if (document != null && resource != null) {
			IProject project = resource.getProject();
			String resourcePath = resource.getProject().getName() + "/" + resource.getProjectRelativePath().toString();
			
			if (repository.isConnected(project)) {
				documentMappings.put(resourcePath, document);
				resourceMappings.put(document, resourcePath);

				document.addDocumentListener(documentListener);
			}
		}
	}
	
	protected void disconnectEditor(AbstractTextEditor texteditor) {
		final IDocument document = texteditor.getDocumentProvider().getDocument(texteditor.getEditorInput());
		
		String resourcePath = resourceMappings.get(document);
		
		document.removeDocumentListener(documentListener);
		documentMappings.remove(resourcePath);
		resourceMappings.remove(document);
	}

}
